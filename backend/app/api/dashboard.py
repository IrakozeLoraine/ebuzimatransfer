from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case
from app.db.session import get_session
from app.core.permissions import get_current_user
from app.models.referral import Referral, ReferralStatus
from app.services.resource_service import ResourceService
from app.schemas.resource import CapacityRow
from typing import List

router = APIRouter()


@router.get("")
async def dashboard(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(
            func.count(Referral.id).label("total"),
            func.sum(case((Referral.status == ReferralStatus.REQUESTED, 1), else_=0)).label("requested"),
            func.sum(case((Referral.status == ReferralStatus.UNDER_REVIEW, 1), else_=0)).label("under_review"),
            func.sum(case((Referral.status == ReferralStatus.ACCEPTED, 1), else_=0)).label("accepted"),
            func.sum(case((Referral.status == ReferralStatus.EN_ROUTE, 1), else_=0)).label("en_route"),
            func.sum(case((Referral.status == ReferralStatus.ARRIVED, 1), else_=0)).label("arrived"),
        )
    )
    row = result.one()
    capacity = await ResourceService(session).capacity_dashboard()

    return {
        "referrals": {
            "total": row.total or 0,
            "requested": row.requested or 0,
            "under_review": row.under_review or 0,
            "accepted": row.accepted or 0,
            "en_route": row.en_route or 0,
            "arrived": row.arrived or 0,
            "active": (row.requested or 0) + (row.under_review or 0) + (row.accepted or 0) + (row.en_route or 0),
        },
        "capacity": [c.model_dump() for c in capacity],
    }


@router.get("/capacity", response_model=List[CapacityRow])
async def capacity_dashboard(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await ResourceService(session).capacity_dashboard()
