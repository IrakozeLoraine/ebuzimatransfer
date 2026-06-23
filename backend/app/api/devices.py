import uuid
from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.permissions import require_roles, get_current_user
from app.core.exceptions import NotFoundError
from app.core.security import generate_device_key
from app.models.ambulance import AmbulanceDevice
from app.services.audit_service import AuditService
from app.schemas.ambulance import (
    AmbulanceDeviceCreate,
    AmbulanceDeviceOut,
    AmbulanceDeviceCreated,
)

router = APIRouter()


def _visible_facility(user) -> uuid.UUID | None:
    """The facility whose devices a non-super-admin can see/manage."""
    return getattr(user, "active_facility_id", None)


@router.get("", response_model=List[AmbulanceDeviceOut])
async def list_devices(
    current_user=Depends(require_roles("CLINICIAN", "FACILITY_ADMIN", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    """Registered trackers, used to assign a device when arranging transport.

    Super admins see every device; everyone else sees their active facility's."""
    stmt = select(AmbulanceDevice).order_by(AmbulanceDevice.created_at.desc())
    if "SUPER_ADMIN" not in current_user.effective_roles:
        stmt = stmt.where(AmbulanceDevice.facility_id == _visible_facility(current_user))
    result = await session.execute(stmt)
    return list(result.scalars())


@router.post("", response_model=AmbulanceDeviceCreated, status_code=201)
async def create_device(
    payload: AmbulanceDeviceCreate,
    current_user=Depends(require_roles("FACILITY_ADMIN", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    """Register a tracker and return its API key once (flash it onto the device)."""
    facility_id = payload.facility_id or _visible_facility(current_user)
    api_key, api_key_hash = generate_device_key()
    device = AmbulanceDevice(
        label=payload.label,
        facility_id=facility_id,
        api_key_hash=api_key_hash,
    )
    session.add(device)
    await AuditService(session).log(
        "CREATE_AMBULANCE_DEVICE", "ambulance_device", user_id=current_user.id
    )
    await session.commit()
    await session.refresh(device)
    return AmbulanceDeviceCreated(
        id=device.id,
        label=device.label,
        facility_id=device.facility_id,
        is_active=device.is_active,
        created_at=device.created_at,
        api_key=api_key,
    )


@router.patch("/{device_id}", response_model=AmbulanceDeviceOut)
async def set_device_active(
    device_id: uuid.UUID,
    is_active: bool,
    current_user=Depends(require_roles("FACILITY_ADMIN", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    """Enable or disable a tracker (a disabled device's pings are rejected)."""
    device = await session.get(AmbulanceDevice, device_id)
    if not device:
        raise NotFoundError("Ambulance device")
    device.is_active = is_active
    await AuditService(session).log(
        "UPDATE_AMBULANCE_DEVICE", "ambulance_device", user_id=current_user.id, entity_id=device_id,
        extra={"is_active": is_active},
    )
    await session.commit()
    await session.refresh(device)
    return device
