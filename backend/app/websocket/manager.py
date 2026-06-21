from __future__ import annotations
import asyncio
from collections import defaultdict
from typing import Any, Dict, Set
from fastapi import WebSocket


class ConnectionManager:
    """A minimal in-memory pub/sub manager for channel-scoped WebSocket fan-out.

    Connections subscribe to a named channel (e.g. ``"capacity"``) and receive
    every JSON message broadcast to that channel. State is per-process; this is
    sufficient for a single-worker deployment.
    """

    def __init__(self) -> None:
        self._channels: Dict[str, Set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, channel: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._channels[channel].add(websocket)

    async def disconnect(self, channel: str, websocket: WebSocket) -> None:
        async with self._lock:
            self._channels.get(channel, set()).discard(websocket)

    async def broadcast_to_channel(self, channel: str, message: Any) -> None:
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
