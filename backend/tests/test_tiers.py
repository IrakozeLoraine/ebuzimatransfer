"""Unit tests for the facility-tier cascading catalog rules."""
import pytest

from app.core import tiers


class TestTierRank:
    def test_known_tiers_are_ordered_low_to_high(self):
        assert tiers.tier_rank("HEALTH_CENTER_POST") == 1
        assert tiers.tier_rank("DISTRICT") == 2
        assert tiers.tier_rank("LEVEL_TWO") == 3
        assert tiers.tier_rank("NRH_UTH") == 4

    def test_unknown_tier_sorts_highest(self):
        assert tiers.tier_rank("SOMETHING_ELSE") == 99

    def test_none_sorts_highest(self):
        assert tiers.tier_rank(None) == 99


class TestEligible:
    def test_unit_at_lower_tier_is_available_to_higher_facility(self):
        # A district-tier unit is available to a national referral hospital.
        assert tiers.eligible("DISTRICT", "NRH_UTH") is True

    def test_unit_at_same_tier_is_available(self):
        assert tiers.eligible("DISTRICT", "DISTRICT") is True

    def test_unit_at_higher_tier_is_not_available_to_lower_facility(self):
        # An NRH-tier unit is NOT exposed to a health center.
        assert tiers.eligible("NRH_UTH", "HEALTH_CENTER_POST") is False

    def test_unknown_unit_tier_never_exposed(self):
        # Unknown tiers rank 99, so they are only "eligible" for another unknown.
        assert tiers.eligible("MYSTERY", "NRH_UTH") is False

    def test_tiers_list_matches_order_mapping(self):
        assert tiers.TIERS == list(tiers.TIER_ORDER.keys())
