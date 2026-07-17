from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.permissions import get_current_user
from app.services.auth_service import AuthService
from app.services.audit_service import AuditService
from app.services.user_service import UserService
from app.schemas.auth import LoginRequest, TokenResponse, RefreshRequest, ChangePasswordRequest, SetPasswordRequest, SwitchFacilityRequest, SwitchContextRequest
from app.schemas.user import UserMe, ProfileUpdate, UserUpdate
from app.dependencies import get_client_ip

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    service = AuthService(session)
    tokens = await service.login(payload)
    if not tokens.requires_password_reset:
        user = await service.repo.get_by_medical_id(payload.medical_id)
        if user:
            await AuditService(session).log("LOGIN", "user", user_id=user.id, ip_address=get_client_ip(request))
    await session.commit()
    return tokens


@router.post("/set-password", response_model=TokenResponse)
async def set_password(
    payload: SetPasswordRequest,
    session: AsyncSession = Depends(get_session),
):
    service = AuthService(session)
    tokens = await service.set_password(payload)
    await session.commit()
    return tokens


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest, session: AsyncSession = Depends(get_session)):
    service = AuthService(session)
    return await service.refresh(payload.refresh_token)


@router.post("/switch-facility", response_model=TokenResponse)
async def switch_facility(
    payload: SwitchFacilityRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    service = AuthService(session)
    tokens = await service.switch_facility(str(current_user.id), payload.facility_id)
    await AuditService(session).log(
        "SWITCH_FACILITY", "user", user_id=current_user.id, entity_id=payload.facility_id
    )
    await session.commit()
    return tokens


@router.post("/switch-context", response_model=TokenResponse)
async def switch_context(
    payload: SwitchContextRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Set the active facility and clinical unit the user is working in."""
    service = AuthService(session)
    tokens = await service.switch_context(
        str(current_user.id), payload.facility_id, payload.unit_id
    )
    await AuditService(session).log(
        "SWITCH_CONTEXT", "user", user_id=current_user.id, entity_id=payload.facility_id
    )
    await session.commit()
    return tokens


@router.post("/logout")
async def logout(current_user=Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    audit = AuditService(session)
    await audit.log("LOGOUT", "user", user_id=current_user.id)
    await session.commit()
    return {"success": True, "message": "Logged out"}


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    service = AuthService(session)
    await service.change_password(str(current_user.id), payload.current_password, payload.new_password)
    await session.commit()
    return {"success": True, "message": "Password updated"}


@router.get("/me", response_model=UserMe)
async def me(current_user=Depends(get_current_user)):
    return UserMe.from_user(current_user)


@router.put("/me", response_model=UserMe)
async def update_me(
    payload: ProfileUpdate,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Self-service update of the signed-in user's own contact details."""
    svc = UserService(session)
    # Only the fields actually sent are applied; reuse update_user with no
    # facility restriction since a user is editing themselves.
    update = UserUpdate(**payload.model_dump(exclude_unset=True))
    await svc.update_user(current_user.id, update, acting_facility_id=None)
    await AuditService(session).log(
        "UPDATE_PROFILE", "user", user_id=current_user.id, entity_id=current_user.id
    )
    await session.commit()
    return UserMe.from_user(current_user)
