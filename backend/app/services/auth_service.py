class AuthService:
    async def login(self, payload: LoginRequest) -> TokenResponse:
        user = await self.repo.get_by_medical_id(payload.medical_id)
        if not user or not user.is_active:
            raise UnauthorizedError("Invalid credentials")
        if user.account_status == AccountStatus.PASSWORD_RESET_ENABLED.value:
            reset_token = create_password_reset_token(str(user.id))
            return TokenResponse(requires_password_reset=True, reset_token=reset_token)
        # No password supplied → ID-check step; tell the frontend to show the password field
        if payload.password is None:
            return TokenResponse(requires_password_reset=False)
        if not verify_password(payload.password, user.password_hash):
            raise UnauthorizedError("Invalid credentials")
        return TokenResponse(
            access_token=create_access_token(str(user.id), user.role_names),
            refresh_token=create_refresh_token(str(user.id)),
        )

    async def set_password(self, payload: SetPasswordRequest) -> TokenResponse:
        token_data = decode_token(payload.reset_token)
        if not token_data or token_data.get("type") != "password_reset":
            raise UnauthorizedError("Invalid or expired reset token")
        user = await self.repo.get_by_id(uuid.UUID(token_data["sub"]))
        if not user or not user.is_active:
            raise UnauthorizedError("User not found")
        user.password_hash  = hash_password(payload.new_password)
        user.account_status = AccountStatus.ACTIVE.value
        await self.session.flush()
        return TokenResponse(
            access_token=create_access_token(str(user.id), user.role_names),
            refresh_token=create_refresh_token(str(user.id)),
        )
