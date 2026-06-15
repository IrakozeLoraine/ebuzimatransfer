from fastapi import HTTPException, status


class AppException(HTTPException):
    def __init__(self, status_code: int, message: str, error_code: str):
        super().__init__(status_code=status_code, detail={"success": False, "message": message, "error_code": error_code})


class NotFoundError(AppException):
    def __init__(self, resource: str):
        super().__init__(404, f"{resource} not found", "NOT_FOUND")


class UnauthorizedError(AppException):
    def __init__(self, message: str = "Unauthorized"):
        super().__init__(401, message, "UNAUTHORIZED")


class ForbiddenError(AppException):
    def __init__(self, message: str = "Insufficient permissions"):
        super().__init__(403, message, "FORBIDDEN")


class ConflictError(AppException):
    def __init__(self, message: str, error_code: str = "CONFLICT"):
        super().__init__(409, message, error_code)


class ValidationError(AppException):
    def __init__(self, message: str):
        super().__init__(422, message, "VALIDATION_ERROR")


class ResourceReservedError(ConflictError):
    def __init__(self):
        super().__init__("Resource is already reserved or unavailable", "RESOURCE_RESERVED")


class InvalidStatusTransitionError(AppException):
    def __init__(self, current: str, target: str):
        super().__init__(409, f"Cannot transition from {current} to {target}", "INVALID_TRANSITION")
