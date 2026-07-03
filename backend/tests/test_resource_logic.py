"""Unit tests for pure resource-service helpers.

``_movable`` decides how many units of a resource group can be re-assigned right
now — the rule that keeps occupied/reserved beds from being moved out from under
a patient. It reads only plain attributes, so it needs no database.
"""
import uuid
from types import SimpleNamespace

from app.services.resource_service import ResourceService


def make_resource(*, facility_id=None, unit_id=None, quantity=0, available=0):
    return SimpleNamespace(
        facility_id=facility_id, unit_id=unit_id, quantity=quantity, available=available
    )


class TestMovable:
    def test_central_stock_is_entirely_movable(self):
        # No facility and no unit → central stock, all units may be re-assigned.
        resource = make_resource(facility_id=None, unit_id=None, quantity=5, available=0)
        assert ResourceService._movable(resource) == 5

    def test_placed_resource_only_moves_its_available_units(self):
        # At a facility/unit only the AVAILABLE units are movable; occupied and
        # reserved beds stay put.
        resource = make_resource(facility_id=uuid.uuid4(), unit_id=uuid.uuid4(), quantity=5, available=2)
        assert ResourceService._movable(resource) == 2

    def test_resource_at_a_facility_without_a_unit_uses_available(self):
        resource = make_resource(facility_id=uuid.uuid4(), unit_id=None, quantity=4, available=3)
        assert ResourceService._movable(resource) == 3

    def test_fully_occupied_resource_is_immovable(self):
        resource = make_resource(facility_id=uuid.uuid4(), unit_id=uuid.uuid4(), quantity=3, available=0)
        assert ResourceService._movable(resource) == 0
