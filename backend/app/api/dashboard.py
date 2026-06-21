from typing import List, Optional
import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.permissions import get_current_user
from app.services.resource_service import ResourceService
from app.schemas.resource import CapacityRow, DashboardActivityRow

router = APIRouter()

SUPER_ADMIN = "SUPER_ADMIN"


def _scope_facility_ids(user) -> Optional[List[uuid.UUID]]:
    """Facilities the dashboard should cover for this user: ``None`` (all) for a
    super admin, otherwise the user's own facilities."""
    if SUPER_ADMIN in set(user.effective_roles):
        return None
    return [f.id for f in user.facilities]


@router.get("/capacity", response_model=List[CapacityRow])
async def capacity_dashboard(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await ResourceService(session).capacity_dashboard(
        facility_ids=_scope_facility_ids(current_user)
    )


@router.get("/activity", response_model=List[DashboardActivityRow])
async def dashboard_activity(
    limit: int = Query(20, ge=1, le=100),
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await ResourceService(session).recent_activity(
        facility_ids=_scope_facility_ids(current_user), limit=limit
    )
