from __future__ import annotations
import io
from datetime import date, datetime, timezone
from typing import Optional
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.facility import Facility
from app.schemas.report import ReferralReportOut, OccupancyReportRow


class ReportService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def referral_report(self, from_date: Optional[date] = None, to_date: Optional[date] = None) -> ReferralReportOut:
        stmt = select(
            func.count(Referral.id).label("total"),
            func.sum(case((Referral.status == ReferralStatus.ACCEPTED, 1), else_=0)).label("accepted"),
            func.sum(case((Referral.status == ReferralStatus.ARRIVED, 1), else_=0)).label("arrived"),
            func.sum(case((Referral.status == ReferralStatus.REJECTED, 1), else_=0)).label("rejected"),
            func.sum(case((Referral.status == ReferralStatus.CANCELLED, 1), else_=0)).label("cancelled"),
            func.sum(case((Referral.status == ReferralStatus.EN_ROUTE, 1), else_=0)).label("en_route"),
        )
        if from_date:
            stmt = stmt.where(Referral.created_at >= datetime.combine(from_date, datetime.min.time()))
        if to_date:
            stmt = stmt.where(Referral.created_at <= datetime.combine(to_date, datetime.max.time()))

        result = await self.session.execute(stmt)
        row = result.one()
        total = row.total or 0
        accepted = row.accepted or 0
        rejected = row.rejected or 0

        return ReferralReportOut(
            total_referrals=total,
            accepted=accepted,
            rejected=rejected,
            cancelled=row.cancelled or 0,
            en_route=row.en_route or 0,
            arrived=row.arrived or 0,
            acceptance_rate=round(accepted / total * 100, 1) if total else 0.0,
            rejection_rate=round(rejected / total * 100, 1) if total else 0.0,
            median_decision_minutes=None,
            avg_transport_minutes=None,
        )

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

    async def export_csv(self) -> bytes:
        import pandas as pd
        report = await self.referral_report()
        df = pd.DataFrame([report.model_dump()])
        buf = io.BytesIO()
        df.to_csv(buf, index=False)
        return buf.getvalue()

    async def export_excel(self) -> bytes:
        import pandas as pd
        report = await self.referral_report()
        occupancy = await self.occupancy_report()
        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            pd.DataFrame([report.model_dump()]).to_excel(writer, sheet_name="Referrals", index=False)
            pd.DataFrame([r.model_dump() for r in occupancy]).to_excel(writer, sheet_name="Occupancy", index=False)
        return buf.getvalue()
