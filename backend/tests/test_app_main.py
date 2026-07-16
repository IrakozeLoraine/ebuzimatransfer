"""Cover the FastAPI app wiring in app.main: the lifespan (WebSocket manager
start/stop) and the /ws/{channel} endpoint, driven with Starlette's TestClient
so the lifespan actually runs. Redis is faked so no broker is needed."""
from starlette.testclient import TestClient

import app.websocket.manager as wsmod


class _FakePubSub:
    async def psubscribe(self, pattern):
        self.pattern = pattern

    async def aclose(self):
        pass

    async def listen(self):
        if False:
            yield {}


class _FakeRedis:
    def pubsub(self, **kwargs):
        return _FakePubSub()

    async def publish(self, channel, data):
        pass

    async def aclose(self):
        pass


def test_lifespan_and_websocket_channel(monkeypatch):
    monkeypatch.setattr(wsmod.aioredis, "from_url", lambda *a, **k: _FakeRedis())

    from app.main import app

    # Entering the TestClient context runs the lifespan (ws_manager.start()).
    with TestClient(app) as client:
        # The /ws/{channel} endpoint: connect, then disconnect to exit its loop.
        with client.websocket_connect("/ws/capacity") as ws:
            ws.close()
    # Leaving the context runs lifespan shutdown (ws_manager.stop()).


def test_health_endpoint(monkeypatch):
    monkeypatch.setattr(wsmod.aioredis, "from_url", lambda *a, **k: _FakeRedis())
    from app.main import app

    with TestClient(app) as client:
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok", "service": "eBuzimaTransfer"}
