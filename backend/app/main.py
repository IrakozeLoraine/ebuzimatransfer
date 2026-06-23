from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.core.config import settings
from app.api import router
from app.core.permissions import decode_token
from app.websocket.manager import ws_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start the Redis-backed WebSocket fan-out so broadcasts reach clients on
    # any worker, then tear it down on shutdown.
    await ws_manager.start()
    try:
        yield
    finally:
        await ws_manager.stop()


limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="eBuzimaTransfer API",
    version="1.0.0",
    description="ICU/HDU Referral Management System for Rwanda",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "eBuzimaTransfer"}


@app.websocket("/ws/{channel}")
async def websocket_channel(websocket: WebSocket, channel: str):
    """Subscribe to channel-scoped broadcasts (e.g. ``capacity`` updates)."""
    await ws_manager.connect(channel, websocket)
    try:
        while True:
            # We only push to clients; reads keep the connection alive and
            # surface disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        await ws_manager.disconnect(channel, websocket)
