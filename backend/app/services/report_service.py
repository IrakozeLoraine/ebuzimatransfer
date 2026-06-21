from __future__ import annotations
import io
from datetime import date, datetime, timezone
from typing import Optional
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.facility import Facility
from app.schemas.report import OccupancyReportRow


class ReportService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def occupancy_report(self) -> list[OccupancyReportRow]:
        from sqlalchemy import case as sa_case
        stmt = (
            select(
                Facility.name.label("facility"),
                Unit.type.label("unit_type"),
                func.count(Resource.id).label("total_resources"),
                func.sum(sa_case((Resource.status == ResourceStatus.OCCUPIED, 1), else_=0)).label("occupied_resources"),
            )
            .join(Unit, Resource.unit_id == Unit.id)
            .join(Facility, Unit.facility_id == Facility.id)
            .where(Facility.is_active == True, Resource.resource_code.is_not(None))
            .group_by(Facility.name, Unit.type)
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
        import pandas as pd
        occupancy = await self.occupancy_report()
        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            pd.DataFrame([r.model_dump() for r in occupancy]).to_excel(writer, sheet_name="Occupancy", index=False)
        return buf.getvalue()
