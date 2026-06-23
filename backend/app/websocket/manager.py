from __future__ import annotations
import asyncio
import json
import logging
from collections import defaultdict
from typing import Any, Dict, Optional, Set
from fastapi import WebSocket
from redis import asyncio as aioredis
from app.core.config import settings

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Channel-scoped WebSocket fan-out backed by Redis pub/sub.

    Each process keeps only the sockets connected to *it*. Broadcasts are
    published to a Redis channel; every worker (including the publisher) runs a
    subscriber that re-delivers each message to its own local sockets. This lets
    the fan-out work across multiple workers/instances rather than a single
    process.
    """

    # Redis channels are namespaced so they can share a database with other keys.
    PREFIX = "ws:"

    def __init__(self) -> None:
        self._channels: Dict[str, Set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()
        self._redis: Optional[aioredis.Redis] = None
        self._pubsub = None
        self._listener: Optional[asyncio.Task] = None

    async def start(self) -> None:
        """Connect to Redis and start the background subscriber. Called on startup."""
        self._redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        self._pubsub = self._redis.pubsub(ignore_subscribe_messages=True)
        await self._pubsub.psubscribe(f"{self.PREFIX}*")
        self._listener = asyncio.create_task(self._listen())

    async def stop(self) -> None:
        """Tear down the subscriber and Redis connections. Called on shutdown."""
        if self._listener:
            self._listener.cancel()
            try:
                await self._listener
            except asyncio.CancelledError:
                pass
            self._listener = None
        if self._pubsub is not None:
            await self._pubsub.aclose()
            self._pubsub = None
        if self._redis is not None:
            await self._redis.aclose()
            self._redis = None

    async def _listen(self) -> None:
        """Relay messages from Redis to this worker's local sockets."""
        assert self._pubsub is not None
        try:
            async for message in self._pubsub.listen():
                if message.get("type") != "pmessage":
                    continue
                redis_channel: str = message["channel"]
                channel = redis_channel[len(self.PREFIX):]
                try:
                    payload = json.loads(message["data"])
                except (TypeError, ValueError):
                    continue
                await self._send_local(channel, payload)
        except asyncio.CancelledError:
            raise
        except Exception:  # pragma: no cover - keep the loop resilient
            logger.exception("WebSocket Redis subscriber crashed")

    async def connect(self, channel: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._channels[channel].add(websocket)

    async def disconnect(self, channel: str, websocket: WebSocket) -> None:
        async with self._lock:
            self._channels.get(channel, set()).discard(websocket)

    async def broadcast_to_user(self, user_id: str, message: Any) -> None:
        """Fan a message out to all sockets a user has open (per-user channel)."""
        await self.broadcast_to_channel(f"user:{user_id}", message)

    async def broadcast_to_channel(self, channel: str, message: Any) -> None:
        """Publish to Redis so every worker delivers to its local subscribers."""
        if self._redis is None:
            # Redis not started (e.g. tests) — deliver locally as a fallback.
            await self._send_local(channel, message)
            return
        await self._redis.publish(f"{self.PREFIX}{channel}", json.dumps(message, default=str))

    async def _send_local(self, channel: str, message: Any) -> None:
        # Copy under lock, send outside the lock so a slow/closed client doesn't
        # block others. Drop connections that fail to receive.
        async with self._lock:
            targets = list(self._channels.get(channel, set()))
        stale: list[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_json(message)
            except Exception:
                stale.append(ws)
        if stale:
            async with self._lock:
                for ws in stale:
                    self._channels.get(channel, set()).discard(ws)


ws_manager = ConnectionManager()
