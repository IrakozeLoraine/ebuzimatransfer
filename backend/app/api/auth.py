from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.permissions import get_current_user
from app.services.auth_service import AuthService
from app.services.audit_service import AuditService
from app.schemas.auth import LoginRequest, TokenResponse, RefreshRequest, ChangePasswordRequest, SetPasswordRequest
from app.schemas.user import UserMe
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
