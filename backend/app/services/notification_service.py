from __future__ import annotations
import uuid
from typing import List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.notification import Notification
from app.models.user import User
from app.websocket.manager import ws_manager


class NotificationService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        user_id: uuid.UUID,
        title: str,
        message: str,
        event_type: str | None = None,
        entity_type: str | None = None,
        entity_id: uuid.UUID | None = None,
    ) -> Notification:
        n = Notification(
            user_id=user_id,
            title=title,
            message=message,
            event_type=event_type,
            entity_type=entity_type,
            entity_id=entity_id,
        )
        self.session.add(n)
        await self.session.flush()

        await ws_manager.broadcast_to_user(
            str(user_id),
            {"event": event_type or "NOTIFICATION", "title": title, "message": message},
        )
        return n

    async def broadcast_event(self, event_type: str, payload: dict) -> None:
        await ws_manager.broadcast_to_channel("notifications", {"event": event_type, **payload})

    async def list_for_user(self, user_id: uuid.UUID, unread_only: bool = False) -> List[Notification]:
        stmt = select(Notification).where(Notification.user_id == user_id)
        if unread_only:
            stmt = stmt.where(Notification.is_read == False)
        stmt = stmt.order_by(Notification.created_at.desc()).limit(50)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def mark_read(self, notification_id: uuid.UUID, user_id: uuid.UUID) -> None:
        result = await self.session.execute(
            select(Notification).where(Notification.id == notification_id, Notification.user_id == user_id)
        )
        n = result.scalar_one_or_none()
        if n:
            n.is_read = True
            await self.session.flush()

    async def notify_role(self, role_name: str, title: str, message: str, event_type: str | None = None) -> None:
        result = await self.session.execute(
            select(User).join(User.roles).where(User.roles.any(name=role_name), User.is_active == True)
        )
        users = result.scalars().all()
        for user in users:
            await self.create(user.id, title, message, event_type)
