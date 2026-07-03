"""Unit tests for OSRM road-routing helpers and their fallback behaviour."""
import pytest

from app.services import routing


# Kigali city centre and Butare (~130 km apart) as reference coordinates.
KGL = (-1.9441, 30.0619)
BUTARE = (-2.5967, 29.7396)


class TestHaversine:
    def test_zero_distance_for_same_point(self):
        assert routing._haversine_m(*KGL, *KGL) == pytest.approx(0.0, abs=1e-6)

    def test_symmetric(self):
        a = routing._haversine_m(*KGL, *BUTARE)
        b = routing._haversine_m(*BUTARE, *KGL)
        assert a == pytest.approx(b)

    def test_plausible_magnitude(self):
        # Straight-line Kigali -> Butare is roughly 75 km.
        meters = routing._haversine_m(*KGL, *BUTARE)
        assert 60_000 < meters < 90_000


class TestStraightLineFallback:
    def test_geometry_is_the_two_endpoints(self):
        route = routing._straight_line(*KGL, *BUTARE)
        assert route.geometry == [KGL, BUTARE]

    def test_duration_derived_from_distance_and_speed(self):
        route = routing._straight_line(*KGL, *BUTARE)
        assert route.duration_s == pytest.approx(
            route.distance_m / routing._FALLBACK_SPEED_MPS
        )
        assert route.duration_s > 0


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _FakeClient:
    """Stand-in for httpx.AsyncClient used as an async context manager."""

    def __init__(self, *, payload=None, exc=None):
        self._payload = payload
        self._exc = exc

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url, params=None):
        if self._exc is not None:
            raise self._exc
        return _FakeResponse(self._payload)


@pytest.fixture
def patch_client(monkeypatch):
    def _apply(**kwargs):
        monkeypatch.setattr(
            routing.httpx, "AsyncClient", lambda *a, **k: _FakeClient(**kwargs)
        )

    return _apply


class TestRoadRoute:
    async def test_uses_osrm_route_when_available(self, patch_client):
        patch_client(
            payload={
                "code": "Ok",
                "routes": [
                    {
                        "duration": 1234.5,
                        "distance": 5678.9,
                        # OSRM returns [lng, lat]; the helper flips to [lat, lng].
                        "geometry": {
                            "coordinates": [
                                [30.0619, -1.9441],
                                [29.7396, -2.5967],
                            ]
                        },
                    }
                ],
            }
        )
        route = await routing.road_route(*KGL, *BUTARE)
        assert route.duration_s == 1234.5
        assert route.distance_m == 5678.9
        assert route.geometry == [KGL, BUTARE]

    async def test_falls_back_when_osrm_reports_no_route(self, patch_client):
        patch_client(payload={"code": "NoRoute", "routes": []})
        route = await routing.road_route(*KGL, *BUTARE)
        # Straight-line fallback: geometry is just the endpoints.
        assert route.geometry == [KGL, BUTARE]

    async def test_falls_back_on_network_error(self, patch_client):
        patch_client(exc=RuntimeError("connection refused"))
        route = await routing.road_route(*KGL, *BUTARE)
        assert route.geometry == [KGL, BUTARE]
        assert route.distance_m == pytest.approx(routing._haversine_m(*KGL, *BUTARE))
