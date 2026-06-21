from fastapi import APIRouter
from app.api import (
    auth,
    users,
    facilities,
    reports,
    audit,
    locations,
    units,
    resources,
    dashboard,
)

router = APIRouter(prefix="/api/v1")
router.include_router(auth.router, prefix="/auth", tags=["Auth"])
router.include_router(users.router, prefix="/users", tags=["Users"])
router.include_router(facilities.router, prefix="/facilities", tags=["Facilities"])
router.include_router(locations.router, prefix="/locations", tags=["Locations"])
router.include_router(reports.router, prefix="/reports", tags=["Reports"])
router.include_router(audit.router, prefix="/audit", tags=["Audit"])
router.include_router(units.router, prefix="/units", tags=["Units"])
router.include_router(resources.router, prefix="/resources", tags=["Resources"])
router.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
