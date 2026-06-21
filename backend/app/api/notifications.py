import uuid
from typing import List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.permissions import get_current_user
from app.services.notification_service import NotificationService
from app.schemas.notification import NotificationOut

router = APIRouter()


@router.get("", response_model=List[NotificationOut])
async def list_notifications(
    unread_only: bool = Query(False),
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await NotificationService(session).list_for_user(current_user.id, unread_only=unread_only)


@router.get("/unread-count")
async def unread_count(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    items = await NotificationService(session).list_for_user(current_user.id, unread_only=True)
    return {"count": len(items)}


@router.patch("/{notification_id}/read")
async def mark_read(
    notification_id: uuid.UUID,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await NotificationService(session).mark_read(notification_id, current_user.id)
    await session.commit()
    return {"success": True}


@router.patch("/mark-all-read")
async def mark_all_read(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await NotificationService(session).mark_all_read(current_user.id)
    await session.commit()
    return {"success": True}
