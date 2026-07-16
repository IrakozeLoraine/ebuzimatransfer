"""Unit tests for the Redis-backed WebSocket ConnectionManager.

Real WebSocket sockets and Redis are replaced with fakes so the connect/
disconnect bookkeeping, local fan-out, stale-socket pruning and the Redis
start/stop/publish paths are all exercised without a broker or network.
"""
import pytest

from app.websocket.manager import ConnectionManager

pytestmark = pytest.mark.asyncio


class FakeWebSocket:
    def __init__(self, *, fail=False):
        self.sent = []
        self.accepted = False
        self.fail = fail

    async def accept(self):
        self.accepted = True

    async def send_json(self, message):
        if self.fail:
            raise RuntimeError("socket closed")
        self.sent.append(message)


class TestLocalFanout:
    async def test_connect_accepts_and_registers(self):
        mgr = ConnectionManager()
        ws = FakeWebSocket()
        await mgr.connect("capacity", ws)
        assert ws.accepted is True

        await mgr.broadcast_to_channel("capacity", {"event": "X"})
        assert ws.sent == [{"event": "X"}]

    async def test_disconnect_stops_delivery(self):
        mgr = ConnectionManager()
        ws = FakeWebSocket()
        await mgr.connect("capacity", ws)
        await mgr.disconnect("capacity", ws)
        await mgr.broadcast_to_channel("capacity", {"event": "X"})
        assert ws.sent == []

    async def test_broadcast_to_user_targets_user_channel(self):
        mgr = ConnectionManager()
        ws = FakeWebSocket()
        await mgr.connect("user:abc", ws)
        await mgr.broadcast_to_user("abc", {"event": "NOTIFICATION"})
        assert ws.sent == [{"event": "NOTIFICATION"}]

    async def test_stale_socket_is_pruned(self):
        mgr = ConnectionManager()
        good = FakeWebSocket()
        bad = FakeWebSocket(fail=True)
        await mgr.connect("capacity", good)
        await mgr.connect("capacity", bad)

        await mgr.broadcast_to_channel("capacity", {"event": "ping"})
        # The failing socket is dropped; a second broadcast only reaches the good one.
        await mgr.broadcast_to_channel("capacity", {"event": "ping2"})
        assert {"event": "ping2"} in good.sent
        assert bad.sent == []


class FakePubSub:
    def __init__(self):
        self.subscribed = None
        self.closed = False

    async def psubscribe(self, pattern):
        self.subscribed = pattern

    async def aclose(self):
        self.closed = True

    async def listen(self):
        # Nothing to yield; the listener task simply idles.
        if False:
            yield {}


class FakeRedis:
    def __init__(self):
        self.published = []
        self.closed = False
        self._pubsub = FakePubSub()

    def pubsub(self, **kwargs):
        return self._pubsub

    async def publish(self, channel, data):
        self.published.append((channel, data))

    async def aclose(self):
        self.closed = True


class TestRedisPath:
    async def test_start_publish_stop(self, monkeypatch):
        import app.websocket.manager as mod

        fake = FakeRedis()
        monkeypatch.setattr(mod.aioredis, "from_url", lambda *a, **k: fake)

        mgr = ConnectionManager()
        await mgr.start()
        assert fake._pubsub.subscribed == f"{ConnectionManager.PREFIX}*"

        # With Redis connected, a broadcast publishes instead of delivering locally.
        await mgr.broadcast_to_channel("capacity", {"event": "RESOURCE_UPDATED"})
        assert fake.published
        channel, data = fake.published[0]
        assert channel == f"{ConnectionManager.PREFIX}capacity"
        assert "RESOURCE_UPDATED" in data

        await mgr.stop()
        assert fake.closed is True
        assert fake._pubsub.closed is True
