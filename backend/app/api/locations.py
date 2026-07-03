from fastapi import APIRouter, Depends, Query
from typing import List, Optional
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.models.location import Location

router = APIRouter()


async def _children(session: AsyncSession, parent_id: Optional[uuid.UUID]) -> List[str]:
    """Sorted names of the locations directly under ``parent_id`` (root when None)."""
    rows = await session.scalars(
        select(Location.name).where(Location.parent_id == parent_id).order_by(Location.name)
    )
    return list(rows)


async def _resolve(session: AsyncSession, names: List[str]) -> Optional[uuid.UUID]:
    """Walk the hierarchy by name from the root and return the id of the last node,
    or None if any step isn't found. ``names`` must be non-empty."""
    parent_id: Optional[uuid.UUID] = None
    for name in names:
        node_id = await session.scalar(
            select(Location.id).where(Location.parent_id == parent_id, Location.name == name)
        )
        if node_id is None:
            return None
        parent_id = node_id
    return parent_id


async def _level_children(session: AsyncSession, names: List[str]) -> List[str]:
    node_id = await _resolve(session, names)
    return [] if node_id is None else await _children(session, node_id)


@router.get("/provinces", response_model=List[str])
async def list_provinces(session: AsyncSession = Depends(get_session)):
    return await _children(session, None)


@router.get("/districts", response_model=List[str])
async def list_districts(province: str = Query(...), session: AsyncSession = Depends(get_session)):
    return await _level_children(session, [province])


@router.get("/sectors", response_model=List[str])
async def list_sectors(
    province: str = Query(...), district: str = Query(...), session: AsyncSession = Depends(get_session)
):
    return await _level_children(session, [province, district])


@router.get("/cells", response_model=List[str])
async def list_cells(
    province: str = Query(...),
    district: str = Query(...),
    sector: str = Query(...),
    session: AsyncSession = Depends(get_session),
):
    return await _level_children(session, [province, district, sector])


@router.get("/villages", response_model=List[str])
async def list_villages(
    province: str = Query(...),
    district: str = Query(...),
    sector: str = Query(...),
    cell: str = Query(...),
    session: AsyncSession = Depends(get_session),
):
    return await _level_children(session, [province, district, sector, cell])


# Back-compat: the old path-style districts endpoint.
@router.get("/provinces/{province}/districts", response_model=List[str])
async def list_districts_legacy(province: str, session: AsyncSession = Depends(get_session)):
    return await _level_children(session, [province])
