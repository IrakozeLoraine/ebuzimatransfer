"""Request rate limiting.

Lives here rather than in ``app.main`` so routers can import the limiter to
decorate individual endpoints without importing the app itself.

An endpoint decorated with ``@limiter.limit(...)`` must take both ``request:
Request`` and ``response: Response`` parameters — slowapi reads the caller off
the first and writes the ``X-RateLimit-*`` headers onto the second, and raises
at request time if either is missing.
"""
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded

from app.core.config import settings


def client_key(request: Request) -> str:
    """The bucket a request is counted against.

    ``X-Real-IP`` is set by our nginx from the connection's peer address, so a
    caller cannot forge it — unlike ``X-Forwarded-For``, which arrives carrying
    whatever the client prepended before nginx appended the real address. Falls
    back to the socket address when the API is reached directly.
    """
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


limiter = Limiter(
    key_func=client_key,
    # The API runs four uvicorn workers behind nginx; an in-process counter
    # would give each worker its own allowance and let callers through four
    # times over, so the counts live in Redis.
    storage_uri=settings.REDIS_URL,
    # A Redis outage must not lock clinicians out of an emergency system: fall
    # back to per-worker in-memory counting, and let the request through if
    # even that fails.
    in_memory_fallback_enabled=True,
    swallow_errors=True,
    # Send X-RateLimit-* and Retry-After so the client can show a useful wait.
    headers_enabled=True,
    # The suite drives many logins through one ASGI client from one address;
    # counting them would fail unrelated tests once a limit is reached.
    enabled=settings.ENVIRONMENT != "test",
)


def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> Response:
    """Answer a throttled request in the same shape as the rest of our errors.

    slowapi's stock handler returns ``{"error": ...}``, which the frontend's
    error reader doesn't know how to read — it looks for ``detail.message`` —
    so the user would be shown a raw "status code 429" instead.
    """
    response = JSONResponse(
        status_code=429,
        content={
            "detail": {
                "success": False,
                "message": "Too many attempts. Please wait a minute and try again.",
                "error_code": "RATE_LIMITED",
            }
        },
    )
    # Private, but it is what slowapi's own handler calls to attach
    # Retry-After and the X-RateLimit-* headers to the rejection.
    return request.app.state.limiter._inject_headers(
        response, request.state.view_rate_limit
    )
