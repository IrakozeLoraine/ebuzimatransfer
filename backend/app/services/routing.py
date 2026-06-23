"""Road routing via a self-hosted OSRM server.

Provides driving duration (for ETAs) and the road geometry (for drawing the
planned route on the map). Falls back to ``None`` on any failure so callers can
degrade gracefully rather than break the track endpoint.
"""
from __future__ import annotations
import logging
from dataclasses import dataclass
from typing import List, Optional, Tuple

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# Keep the routing call short; the map should never hang on a slow OSRM.
_TIMEOUT_S = 5.0


@dataclass
class RoadRoute:
    duration_s: float
    distance_m: float
    # Ordered [latitude, longitude] points along the road (decoded GeoJSON).
    geometry: List[Tuple[float, float]]


async def road_route(
    from_lat: float, from_lng: float, to_lat: float, to_lng: float
) -> Optional[RoadRoute]:
    """Driving route between two points, or ``None`` if OSRM is unavailable."""
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
            return None
        route = data["routes"][0]
        geometry = [(lat, lng) for lng, lat in route["geometry"]["coordinates"]]
        return RoadRoute(
            duration_s=float(route["duration"]),
            distance_m=float(route["distance"]),
            geometry=geometry,
        )
    except Exception:
        logger.warning("OSRM routing request failed", exc_info=True)
        return None
