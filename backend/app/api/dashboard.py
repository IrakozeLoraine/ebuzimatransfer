from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case
from app.db.session import get_session
from app.core.permissions import get_current_user
from app.services.resource_service import ResourceService
from app.schemas.resource import CapacityRow
from typing import List

router = APIRouter()

@router.get("/capacity", response_model=List[CapacityRow])
async def capacity_dashboard(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await ResourceService(session).capacity_dashboard()
