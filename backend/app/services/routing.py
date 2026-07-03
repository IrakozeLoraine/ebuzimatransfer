"""Road routing via a self-hosted OSRM server.

Provides driving duration (for ETAs) and the road geometry (for drawing the
planned route on the map). Falls back to ``None`` on any failure so callers can
degrade gracefully rather than break the track endpoint.
"""
from __future__ import annotations
import logging
import math
from dataclasses import dataclass
from typing import List, Optional, Tuple

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# Keep the routing call short; the map should never hang on a slow OSRM.
_TIMEOUT_S = 5.0
# Rough average ground-ambulance speed for the straight-line ETA fallback (~40 km/h).
_FALLBACK_SPEED_MPS = 40_000 / 3600


@dataclass
class RoadRoute:
    duration_s: float
    distance_m: float
    # Ordered [latitude, longitude] points along the road (decoded GeoJSON).
    geometry: List[Tuple[float, float]]


def _haversine_m(from_lat: float, from_lng: float, to_lat: float, to_lng: float) -> float:
    r = 6_371_000.0
    p1, p2 = math.radians(from_lat), math.radians(to_lat)
    dphi = math.radians(to_lat - from_lat)
    dlmb = math.radians(to_lng - from_lng)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _straight_line(from_lat: float, from_lng: float, to_lat: float, to_lng: float) -> RoadRoute:
    """A direct line between the points — used when no routing server is reachable, so
    the map still traces the journey end-to-end."""
    dist = _haversine_m(from_lat, from_lng, to_lat, to_lng)
    return RoadRoute(
        duration_s=dist / _FALLBACK_SPEED_MPS,
        distance_m=dist,
        geometry=[(from_lat, from_lng), (to_lat, to_lng)],
    )


async def road_route(
    from_lat: float, from_lng: float, to_lat: float, to_lng: float
) -> Optional[RoadRoute]:
    """Driving route between two points. Tries the configured OSRM server for a real
    road route/ETA; if that's unavailable, falls back to a straight line so the map
    always shows the journey."""
    # OSRM expects {lng},{lat} pairs.
    coords = f"{from_lng},{from_lat};{to_lng},{to_lat}"
    url = f"{settings.OSRM_BASE_URL.rstrip('/')}/route/v1/driving/{coords}"
    params = {"overview": "full", "geometries": "geojson"}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_S) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        if data.get("code") != "Ok" or not data.get("routes"):
            return _straight_line(from_lat, from_lng, to_lat, to_lng)
        route = data["routes"][0]
        geometry = [(lat, lng) for lng, lat in route["geometry"]["coordinates"]]
        return RoadRoute(
            duration_s=float(route["duration"]),
            distance_m=float(route["distance"]),
            geometry=geometry,
        )
    except Exception:
        logger.warning("OSRM routing unavailable — using straight-line fallback", exc_info=True)
        return _straight_line(from_lat, from_lng, to_lat, to_lng)
