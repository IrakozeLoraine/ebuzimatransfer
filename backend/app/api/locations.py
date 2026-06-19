from fastapi import APIRouter, HTTPException
from typing import List

router = APIRouter()

PROVINCES: dict[str, list[str]] = {
    "Kigali City": ["Gasabo", "Kicukiro", "Nyarugenge"],
    "Northern Province": ["Burera", "Gakenke", "Gicumbi", "Musanze", "Rulindo"],
    "Southern Province": ["Gisagara", "Huye", "Kamonyi", "Muhanga", "Nyamagabe", "Nyanza", "Nyaruguru", "Ruhango"],
    "Eastern Province": ["Bugesera", "Gatsibo", "Kayonza", "Kirehe", "Ngoma", "Nyagatare", "Rwamagana"],
    "Western Province": ["Karongi", "Ngororero", "Nyabihu", "Nyamasheke", "Rubavu", "Rusizi", "Rutsiro"],
}


@router.get("/provinces", response_model=List[str])
async def list_provinces():
    return list(PROVINCES.keys())


@router.get("/provinces/{province}/districts", response_model=List[str])
async def list_districts(province: str):
    districts = PROVINCES.get(province)
    if districts is None:
        raise HTTPException(status_code=404, detail=f"Province '{province}' not found")
    return districts
