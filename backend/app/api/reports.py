from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.permissions import require_roles
from app.services.report_service import ReportService
from app.schemas.report import OccupancyReportRow
from typing import List

router = APIRouter()

@router.get("/occupancy", response_model=List[OccupancyReportRow])
async def occupancy_report(
    current_user=Depends(require_roles("SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    return await ReportService(session).occupancy_report()


@router.get("/export/excel")
async def export_excel(
    current_user=Depends(require_roles("SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    data = await ReportService(session).export_excel()
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=report.xlsx"},
    )
