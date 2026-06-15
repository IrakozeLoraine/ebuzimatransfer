@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, request: Request, session: AsyncSession = Depends(get_session)):
    service = AuthService(session)
    tokens  = await service.login(payload)
    if not tokens.requires_password_reset:
        user = await service.repo.get_by_medical_id(payload.medical_id)
        if user:
            await AuditService(session).log("LOGIN", "user", user_id=user.id, ip_address=get_client_ip(request))
    await session.commit()
    return tokens

@router.post("/set-password", response_model=TokenResponse)
async def set_password(payload: SetPasswordRequest, session: AsyncSession = Depends(get_session)):
    tokens = await AuthService(session).set_password(payload)
    await session.commit()
    return tokens
