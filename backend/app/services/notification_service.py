from __future__ import annotations
import uuid
from typing import List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.notification import Notification
from app.models.user import User, UserFacilityRole, UserFacilityUnit, Role
from app.websocket.manager import ws_manager


def _is_super_admin(user: User) -> bool:
    """System admins manage the platform, not patient flow, so they're excluded from
    operational referral/transport notifications even if they also hold a clinician
    grant somewhere."""
    return any(fr.role.name == "SUPER_ADMIN" for fr in user.facility_roles)


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

    async def mark_all_read(self, user_id: uuid.UUID) -> None:
        result = await self.session.execute(
            select(Notification).where(Notification.user_id == user_id, Notification.is_read == False)
        )
        for n in result.scalars().all():
            n.is_read = True
        await self.session.flush()

    async def notify_role(
        self,
        role_name: str,
        title: str,
        message: str,
        event_type: str | None = None,
        entity_type: str | None = None,
        entity_id: uuid.UUID | None = None,
        facility_id: uuid.UUID | None = None,
    ) -> None:
        """Notify every active user holding ``role_name`` (optionally at one facility)."""
        stmt = (
            select(User)
            .join(UserFacilityRole, UserFacilityRole.user_id == User.id)
            .join(Role, Role.id == UserFacilityRole.role_id)
            .where(Role.name == role_name, User.is_active == True)
        )
        if facility_id is not None:
            stmt = stmt.where(UserFacilityRole.facility_id == facility_id)
        result = await self.session.execute(stmt.distinct())
        for user in result.scalars().all():
            if _is_super_admin(user):
                continue
            await self.create(user.id, title, message, event_type, entity_type, entity_id)

    async def notify_facility_unit(
        self,
        facility_id: uuid.UUID,
        unit_id: uuid.UUID | None,
        role_name: str,
        title: str,
        message: str,
        event_type: str | None = None,
        entity_type: str | None = None,
        entity_id: uuid.UUID | None = None,
        exclude_user_id: uuid.UUID | None = None,
    ) -> None:
        """Notify active users with ``role_name`` at ``facility_id`` who belong to
        ``unit_id`` (same clinical unit). When ``unit_id`` is None, notifies all
        such users at the facility."""
        stmt = (
            select(User)
            .join(UserFacilityRole, UserFacilityRole.user_id == User.id)
            .join(Role, Role.id == UserFacilityRole.role_id)
            .where(
                Role.name == role_name,
                User.is_active == True,
                UserFacilityRole.facility_id == facility_id,
            )
        )
        if unit_id is not None:
            stmt = stmt.join(
                UserFacilityUnit,
                (UserFacilityUnit.user_id == User.id)
                & (UserFacilityUnit.facility_id == facility_id),
            ).where(UserFacilityUnit.unit_id == unit_id)
        result = await self.session.execute(stmt.distinct())
        for user in result.scalars().all():
            if exclude_user_id and user.id == exclude_user_id:
                continue
            if _is_super_admin(user):
                continue
            await self.create(user.id, title, message, event_type, entity_type, entity_id)
