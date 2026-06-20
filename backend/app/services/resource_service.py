from __future__ import annotations
import uuid
from typing import List
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.exceptions import NotFoundError, ResourceReservedError
from app.models.resource import Resource, ResourceStatus, ResourceReservation
from app.models.referral import ReferralStatus
from app.repositories.resource_repository import ResourceRepository
from app.repositories.referral_repository import ReferralRepository
from app.schemas.resource import ResourceCreate, ResourceUpdate, ResourceStatusUpdate, CapacityRow


class ResourceService:
    def __init__(self, session: AsyncSession):
        self.repo = ResourceRepository(session)
        self.session = session

    async def create(self, data: ResourceCreate) -> Resource:
        resource = Resource(**data.model_dump())
        return await self.repo.create(resource)

    async def get(self, resource_id: uuid.UUID) -> Resource:
        resource = await self.repo.get_by_id(resource_id)
        if not resource:
            raise NotFoundError("Resource")
        return resource

    async def list_all(self, limit: int = 500, offset: int = 0) -> List[Resource]:
        result = await self.session.execute(
            select(Resource).where(Resource.resource_code.is_not(None)).limit(limit).offset(offset)
        )
        return list(result.scalars().all())

    async def update_status(self, resource_id: uuid.UUID, data: ResourceStatusUpdate) -> Resource:
        resource = await self.get(resource_id)
        resource.status = data.status
        await self.session.flush()
        return resource

    async def reserve(
        self,
        resource_id: uuid.UUID,
        referral_id: uuid.UUID,
        reserved_by: uuid.UUID,
        planned_admission_time: datetime | None = None,
    ) -> ResourceReservation:
        """Atomically reserve a resource using SELECT FOR UPDATE."""
        resource = await self.repo.lock_for_update(resource_id)
        if not resource or resource.status != ResourceStatus.AVAILABLE:
            raise ResourceReservedError()

        resource.status = ResourceStatus.RESERVED
        reservation = ResourceReservation(
            resource_id=resource_id,
            referral_id=referral_id,
            reserved_by=reserved_by,
            planned_admission_time=planned_admission_time,
        )
        self.session.add(reservation)

        ref_repo = ReferralRepository(self.session)
        referral = await ref_repo.get_by_id(referral_id)
        if referral:
            referral.status = ReferralStatus.ACCEPTED

        await self.session.flush()
        return reservation

    async def capacity_dashboard(self) -> List[CapacityRow]:
        rows = await self.repo.capacity_summary_raw()
        result = []
        for r in rows:
            result.append(CapacityRow(
                facility_id=r["facility_id"],
                facility=r["facility"],
                unit_type=r["unit_type"],
                total=r["total"] or 0,
                available=r["available"] or 0,
                occupied=r["occupied"] or 0,
                reserved=r["reserved"] or 0,
                out_of_service=r["out_of_service"] or 0,
            ))
        return result
