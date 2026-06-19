from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.db.session import get_session
from app.core.permissions import require_role
from app.models.audit_log import AuditLog
from app.models.user import User
from app.models.facility import Facility
import uuid

router = APIRouter()


def _user_summary(user: Optional[User]) -> Optional[dict]:
    if user is None:
        return None
    return {
        "id": str(user.id),
        "name": user.full_name,
        "email": user.email,
    }


@router.get("")
async def list_audit_logs(
    entity_type: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    user_id: Optional[uuid.UUID] = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    current_user=Depends(require_role("SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    stmt = (
        select(AuditLog)
        .options(selectinload(AuditLog.user))
        .order_by(AuditLog.created_at.desc())
    )
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    stmt = stmt.offset(offset).limit(limit)
    result = await session.execute(stmt)
    logs = result.scalars().all()

    # Resolve entities to human-readable labels, batching one query per type.
    user_entity_ids = {
        log.entity_id for log in logs if log.entity_type == "user" and log.entity_id
    }
    facility_entity_ids = {
        log.entity_id for log in logs if log.entity_type == "facility" and log.entity_id
    }

    users_by_id: dict[uuid.UUID, User] = {}
    if user_entity_ids:
        rows = await session.execute(select(User).where(User.id.in_(user_entity_ids)))
        users_by_id = {u.id: u for u in rows.scalars().all()}

    facilities_by_id: dict[uuid.UUID, Facility] = {}
    if facility_entity_ids:
        rows = await session.execute(
            select(Facility).where(Facility.id.in_(facility_entity_ids))
        )
        facilities_by_id = {f.id: f for f in rows.scalars().all()}

    def entity_label(log: AuditLog) -> Optional[str]:
        if not log.entity_id:
            return None
        if log.entity_type == "user":
            user = users_by_id.get(log.entity_id)
            return user.full_name if user else None
        if log.entity_type == "facility":
            facility = facilities_by_id.get(log.entity_id)
            return facility.name if facility else None
        return None

    return [
        {
            "id": str(log.id),
            "user": _user_summary(log.user),
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": str(log.entity_id) if log.entity_id else None,
            "entity": entity_label(log),
            "ip_address": log.ip_address,
            "extra": log.extra,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]
