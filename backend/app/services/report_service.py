from __future__ import annotations
import io
from datetime import date, datetime, timezone
from typing import Optional
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.facility import Facility
from app.models.unit import Unit
from app.models.resource import Resource
from app.schemas.report import OccupancyReportRow


class ReportService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def occupancy_report(self) -> list[OccupancyReportRow]:
        stmt = (
            select(
                Facility.name.label("facility"),
                Unit.name.label("unit_type"),
                func.coalesce(func.sum(Resource.quantity), 0).label("total_resources"),
                func.coalesce(func.sum(Resource.occupied), 0).label("occupied_resources"),
            )
            .join(Unit, Resource.unit_id == Unit.id)
            .join(Facility, Resource.facility_id == Facility.id)
            .where(Facility.is_active == True)
            .group_by(Facility.name, Unit.name)
        )
        result = await self.session.execute(stmt)
        rows = []
        for r in result.all():
            total = r.total_resources or 0
            occupied = r.occupied_resources or 0
            rows.append(OccupancyReportRow(
                facility=r.facility,
                unit_type=r.unit_type,
                total_resources=total,
                occupied_resources=occupied,
                occupancy_rate=round(occupied / total * 100, 1) if total else 0.0,
            ))
        return rows

    async def export_excel(self) -> bytes:
        from openpyxl import Workbook

        occupancy = await self.occupancy_report()
        fields = list(OccupancyReportRow.model_fields)
        wb = Workbook()
        ws = wb.active
        ws.title = "Occupancy"
        ws.append(fields)
        for row in occupancy:
            ws.append([getattr(row, f) for f in fields])
        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()
