from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.permissions import require_role
from app.models.audit_log import AuditLog
import uuid

router = APIRouter()


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
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc())
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    stmt = stmt.offset(offset).limit(limit)
    result = await session.execute(stmt)
    logs = result.scalars().all()
    return [
        {
            "id": str(log.id),
            "user_id": str(log.user_id) if log.user_id else None,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": str(log.entity_id) if log.entity_id else None,
            "ip_address": log.ip_address,
            "extra": log.extra,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]
