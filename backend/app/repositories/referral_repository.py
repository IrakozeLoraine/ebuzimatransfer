from __future__ import annotations
import uuid
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.referral import Referral, ReferralStatus, ReferralStatusHistory
from app.repositories.base import BaseRepository


class ReferralRepository(BaseRepository[Referral]):
    def __init__(self, session: AsyncSession):
        super().__init__(Referral, session)

    async def get_with_relations(self, referral_id: uuid.UUID) -> Optional[Referral]:
        result = await self.session.execute(
            select(Referral)
            .where(Referral.id == referral_id)
            .options(
                selectinload(Referral.status_history).selectinload(ReferralStatusHistory.actor),
                selectinload(Referral.resource_reservation),
                selectinload(Referral.transport_events),
                selectinload(Referral.creator),
                selectinload(Referral.requested_resource),
            )
        )
        return result.scalar_one_or_none()

    async def list_with_filters(
        self,
        status: Optional[ReferralStatus] = None,
        facility_id: Optional[uuid.UUID] = None,
        created_by: Optional[uuid.UUID] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Referral]:
        stmt = select(Referral).options(selectinload(Referral.status_history))
        if status:
            stmt = stmt.where(Referral.status == status)
        if facility_id:
            stmt = stmt.where(Referral.referring_facility_id == facility_id)
        if created_by:
            stmt = stmt.where(Referral.created_by == created_by)
        stmt = stmt.order_by(Referral.created_at.desc()).offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_for_facilities(
        self,
        facility_ids: List[uuid.UUID],
        status: Optional[ReferralStatus] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Referral]:
        """Requests touching any of these facilities (referring/preferred/accepted)."""
        from sqlalchemy import or_
        if not facility_ids:
            return []
        stmt = select(Referral).options(selectinload(Referral.status_history)).where(
            or_(
                Referral.referring_facility_id.in_(facility_ids),
                Referral.preferred_facility_id.in_(facility_ids),
                Referral.accepted_facility_id.in_(facility_ids),
            )
        )
        if status:
            stmt = stmt.where(Referral.status == status)
        stmt = stmt.order_by(Referral.created_at.desc()).offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_for_clinician(
        self,
        user_id: uuid.UUID,
        unit_ids: Optional[List[uuid.UUID]],
        status: Optional[ReferralStatus] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Referral]:
        """A clinician's own requests plus any sharing a clinical unit they work in
        (origin unit outbound, or requested unit inbound)."""
        from sqlalchemy import or_
        conds = [Referral.created_by == user_id]
        if unit_ids:
            conds.append(Referral.origin_unit_id.in_(unit_ids))
            conds.append(Referral.requested_unit_id.in_(unit_ids))
        stmt = select(Referral).options(selectinload(Referral.status_history)).where(or_(*conds))
        if status:
            stmt = stmt.where(Referral.status == status)
        stmt = stmt.order_by(Referral.created_at.desc()).offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_accepted_awaiting_transport(self) -> List[Referral]:
        result = await self.session.execute(
            select(Referral)
            .where(Referral.status == ReferralStatus.ACCEPTED)
            .options(selectinload(Referral.transport_events))
            .order_by(Referral.updated_at.asc())
        )
        return list(result.scalars().all())

    async def next_referral_number(self) -> str:
        from datetime import datetime
        from sqlalchemy import func as sqlfunc
        count_result = await self.session.execute(select(sqlfunc.count(Referral.id)))
        count = count_result.scalar_one() + 1
        year = datetime.utcnow().year
        return f"REF-{year}-{count:05d}"
