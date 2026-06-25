from __future__ import annotations
import uuid
from typing import List, Optional
from datetime import datetime
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.exceptions import NotFoundError, InvalidStatusTransitionError, ValidationError, ForbiddenError
from app.models.referral import Referral, ReferralStatus, ReferralStatusHistory, ArrivalCondition, ALLOWED_TRANSITIONS
from app.repositories.referral_repository import ReferralRepository
from app.repositories.resource_repository import ResourceRepository
from app.schemas.referral import ReferralCreate, AcceptReferralRequest, RejectReferralRequest
from app.services.resource_service import ResourceService
from app.services.audit_service import AuditService


class ReferralService:
    def __init__(self, session: AsyncSession):
        self.repo = ReferralRepository(session)
        self.resource_service = ResourceService(session)
        self.session = session

    async def create(
        self,
        data: ReferralCreate,
        created_by: uuid.UUID,
        referring_facility_id: Optional[uuid.UUID] = None,
        origin_unit_id: Optional[uuid.UUID] = None,
    ) -> Referral:
        number = await self.repo.next_referral_number()
        referral = Referral(
            referral_number=number,
            created_by=created_by,
            referring_facility_id=referring_facility_id,
            origin_unit_id=origin_unit_id,
            **data.model_dump(),
        )
        await self.repo.create(referral)
        await self._record_history(referral.id, ReferralStatus.REQUESTED, created_by)
        return referral

    async def list_visible(
        self,
        viewer,
        status: Optional[ReferralStatus] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Referral]:
        """List transfer requests visible to ``viewer``:
        - super admin: all
        - facility admin / ambulance coordinator: those touching their facilities
        - clinician: their own + any sharing a clinical unit they work in (either side)
        """
        roles = set(getattr(viewer, "effective_roles", []))
        if "SUPER_ADMIN" in roles:
            return await self.repo.list_with_filters(status=status, limit=limit, offset=offset)
        if "FACILITY_ADMIN" in roles:
            facility_ids = [f.id for f in getattr(viewer, "facilities", [])]
            return await self.repo.list_for_facilities(facility_ids, status=status, limit=limit, offset=offset)
        return await self.repo.list_for_clinician(
            viewer.id, getattr(viewer, "unit_ids", None), status=status, limit=limit, offset=offset
        )

    async def get(self, referral_id: uuid.UUID) -> Referral:
        referral = await self.repo.get_with_relations(referral_id)
        if not referral:
            raise NotFoundError("Referral")
        return referral

    async def list(
        self,
        status: Optional[ReferralStatus] = None,
        facility_id: Optional[uuid.UUID] = None,
        created_by: Optional[uuid.UUID] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Referral]:
        return await self.repo.list_with_filters(status=status, facility_id=facility_id, created_by=created_by, limit=limit, offset=offset)

    async def change_status(self, referral_id: uuid.UUID, new_status: ReferralStatus, actor_id: uuid.UUID, comment: Optional[str] = None) -> Referral:
        referral = await self.repo.get_by_id(referral_id)
        if not referral:
            raise NotFoundError("Referral")
        if new_status not in ALLOWED_TRANSITIONS.get(referral.status, []):
            raise InvalidStatusTransitionError(referral.status, new_status)
        referral.status = new_status
        await self._record_history(referral_id, new_status, actor_id, comment)
        await self.session.flush()
        return referral

    def assert_can_approve(self, referral: Referral, actor) -> None:
        """Only staff at the destination (the facility — and, when named, the unit —
        the request was sent to) may approve it, and never the clinician who sent it.
        Super admins are exempt."""
        roles = set(getattr(actor, "effective_roles", []))
        if "SUPER_ADMIN" in roles:
            return
        if referral.created_by == actor.id:
            raise ForbiddenError("You cannot approve a transfer request you sent.")
        # Facility the request was sent to (it hasn't been accepted yet here).
        receiving_facility_id = referral.preferred_facility_id
        active = getattr(actor, "active_facility_id", None)
        actor_facility_ids = (
            {active} if active is not None else {f.id for f in getattr(actor, "facilities", [])}
        )
        if receiving_facility_id is None or receiving_facility_id not in actor_facility_ids:
            raise ForbiddenError("Only staff at the destination facility can approve this request.")
        # Clinicians must also work in the requested unit; facility admins manage the
        # whole facility, so the unit constraint does not apply to them.
        if (
            referral.requested_unit_id is not None
            and "FACILITY_ADMIN" not in roles
            and referral.requested_unit_id not in set(getattr(actor, "unit_ids", []))
        ):
            raise ForbiddenError("Only staff in the requested unit can approve this request.")

    async def accept(self, referral_id: uuid.UUID, data: AcceptReferralRequest, actor) -> Referral:
        referral = await self.repo.get_by_id(referral_id)
        if not referral:
            raise NotFoundError("Referral")
        self.assert_can_approve(referral, actor)
        actor_id = actor.id
        if ReferralStatus.ACCEPTED not in ALLOWED_TRANSITIONS.get(referral.status, []):
            raise InvalidStatusTransitionError(referral.status, ReferralStatus.ACCEPTED)

        resource = await self.resource_service.get(data.resource_id)
        await self.resource_service.reserve(
            resource_id=data.resource_id,
            referral_id=referral_id,
            reserved_by=actor_id,
            planned_admission_time=data.planned_admission_time,
        )
        referral.status = ReferralStatus.ACCEPTED
        # The receiving facility is the one that owns the reserved resource.
        referral.accepted_facility_id = resource.facility_id
        await self._record_history(referral_id, ReferralStatus.ACCEPTED, actor_id)
        await self.session.flush()
        return referral

    async def auto_pick_resource(self, referral_id: uuid.UUID, facility_id: uuid.UUID) -> Optional[uuid.UUID]:
        """Pick an available resource at ``facility_id`` in the request's requested
        unit (falls back to any available resource at the facility). Enables
        one-click approval."""
        referral = await self.repo.get_by_id(referral_id)
        if not referral:
            raise NotFoundError("Referral")
        resources = await self.resource_service.repo.list_scoped(facility_id=facility_id)
        available = [
            r for r in resources
            if r.available > 0
        ]
        if referral.requested_unit_id is not None:
            in_unit = [r for r in available if r.unit_id == referral.requested_unit_id]
            if in_unit:
                return in_unit[0].id
        return available[0].id if available else None

    async def reject(self, referral_id: uuid.UUID, data: RejectReferralRequest, actor) -> Referral:
        referral = await self.repo.get_by_id(referral_id)
        if not referral:
            raise NotFoundError("Referral")
        self.assert_can_approve(referral, actor)
        actor_id = actor.id
        if ReferralStatus.REJECTED not in ALLOWED_TRANSITIONS.get(referral.status, []):
            raise InvalidStatusTransitionError(referral.status, ReferralStatus.REJECTED)
        referral.status = ReferralStatus.REJECTED
        referral.rejection_reason = data.reason
        referral.rejection_comment = data.comment
        await self._record_history(referral_id, ReferralStatus.REJECTED, actor_id, data.comment)
        await self.session.flush()
        return referral

    async def set_arrival_condition(self, referral_id: uuid.UUID, condition: ArrivalCondition, actor_id: uuid.UUID) -> Referral:
        referral = await self.repo.get_by_id(referral_id)
        if not referral:
            raise NotFoundError("Referral")
        if referral.status != ReferralStatus.ARRIVED:
            raise ValidationError("Arrival condition can only be recorded once the patient has arrived")
        referral.arrival_condition = condition
        await self._record_history(
            referral_id, ReferralStatus.ARRIVED, actor_id, f"Arrival condition: {condition.value}"
        )
        await self.session.flush()
        return referral

    async def transit_stats(self, facility_ids: Optional[List[uuid.UUID]] = None) -> dict:
        """Transit duration (EN_ROUTE → ARRIVED) stats over completed journeys.

        ``facility_ids`` scopes to journeys whose receiving (accepted) or
        referring facility is in the list; ``None`` covers all facilities.
        """
        def _scope(stmt):
            if facility_ids is not None:
                stmt = stmt.where(
                    or_(
                        Referral.accepted_facility_id.in_(facility_ids),
                        Referral.referring_facility_id.in_(facility_ids),
                    )
                )
            return stmt

        # Arrival-condition breakdown over all referrals with a recorded condition.
        arrival_conditions = {c.value: 0 for c in ArrivalCondition}
        if facility_ids is None or facility_ids:
            cond_stmt = _scope(
                select(Referral.arrival_condition, func.count())
                .where(Referral.arrival_condition.isnot(None))
                .group_by(Referral.arrival_condition)
            )
            for condition, count in (await self.session.execute(cond_stmt)).all():
                arrival_conditions[condition.value] = count

        empty = {
            "completed_journeys": 0,
            "average_minutes": None,
            "fastest_minutes": None,
            "slowest_minutes": None,
            "arrival_conditions": arrival_conditions,
        }
        if facility_ids is not None and not facility_ids:
            return empty

        H = ReferralStatusHistory
        enroute = (
            select(H.referral_id, func.min(H.created_at).label("t"))
            .where(H.status == ReferralStatus.EN_ROUTE)
            .group_by(H.referral_id)
            .subquery()
        )
        arrived = (
            select(H.referral_id, func.min(H.created_at).label("t"))
            .where(H.status == ReferralStatus.ARRIVED)
            .group_by(H.referral_id)
            .subquery()
        )
        stmt = _scope(
            select(enroute.c.t, arrived.c.t)
            .join(arrived, arrived.c.referral_id == enroute.c.referral_id)
            .join(Referral, Referral.id == enroute.c.referral_id)
        )

        rows = (await self.session.execute(stmt)).all()
        durations = [
            (arr - dep).total_seconds() / 60
            for dep, arr in rows
            if dep is not None and arr is not None and arr >= dep
        ]
        if not durations:
            return empty
        return {
            "completed_journeys": len(durations),
            "average_minutes": round(sum(durations) / len(durations), 1),
            "fastest_minutes": round(min(durations), 1),
            "slowest_minutes": round(max(durations), 1),
            "arrival_conditions": arrival_conditions,
        }

    async def get_transport_queue(self) -> List[Referral]:
        return await self.repo.get_accepted_awaiting_transport()

    async def _record_history(self, referral_id: uuid.UUID, status: ReferralStatus, actor_id: uuid.UUID, comment: Optional[str] = None) -> None:
        history = ReferralStatusHistory(
            referral_id=referral_id,
            status=status,
            changed_by=actor_id,
            comment=comment,
        )
        self.session.add(history)
        await self.session.flush()
