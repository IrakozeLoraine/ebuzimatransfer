from __future__ import annotations
import uuid
from typing import List, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.exceptions import NotFoundError, InvalidStatusTransitionError
from app.models.referral import Referral, ReferralStatus, ReferralStatusHistory, ALLOWED_TRANSITIONS
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
        - clinician: their own + any sharing their clinical unit (either side)
        """
        roles = set(getattr(viewer, "effective_roles", []))
        if "SUPER_ADMIN" in roles:
            return await self.repo.list_with_filters(status=status, limit=limit, offset=offset)
        if roles & {"FACILITY_ADMIN", "AMBULANCE_COORDINATOR"}:
            facility_ids = [f.id for f in getattr(viewer, "facilities", [])]
            return await self.repo.list_for_facilities(facility_ids, status=status, limit=limit, offset=offset)
        return await self.repo.list_for_clinician(
            viewer.id, getattr(viewer, "unit_id", None), status=status, limit=limit, offset=offset
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

    async def accept(self, referral_id: uuid.UUID, data: AcceptReferralRequest, actor_id: uuid.UUID) -> Referral:
        referral = await self.repo.get_by_id(referral_id)
        if not referral:
            raise NotFoundError("Referral")
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
            if r.status.value == "AVAILABLE"
        ]
        if referral.requested_unit_id is not None:
            in_unit = [r for r in available if r.unit_id == referral.requested_unit_id]
            if in_unit:
                return in_unit[0].id
        return available[0].id if available else None

    async def reject(self, referral_id: uuid.UUID, data: RejectReferralRequest, actor_id: uuid.UUID) -> Referral:
        referral = await self.repo.get_by_id(referral_id)
        if not referral:
            raise NotFoundError("Referral")
        if ReferralStatus.REJECTED not in ALLOWED_TRANSITIONS.get(referral.status, []):
            raise InvalidStatusTransitionError(referral.status, ReferralStatus.REJECTED)
        referral.status = ReferralStatus.REJECTED
        referral.rejection_reason = data.reason
        referral.rejection_comment = data.comment
        await self._record_history(referral_id, ReferralStatus.REJECTED, actor_id, data.comment)
        await self.session.flush()
        return referral

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
