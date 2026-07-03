"""Unit tests for the referral status state machine (``ALLOWED_TRANSITIONS``).

The transition map is the contract the service enforces on every status change,
so we pin down both what is permitted and — just as importantly — what is not
(no skipping transport, no resurrecting terminal requests, no going backwards).
"""
import pytest

from app.models.referral import ReferralStatus, ArrivalCondition, ALLOWED_TRANSITIONS

S = ReferralStatus


class TestAllowedTransitions:
    def test_every_status_has_a_transition_entry(self):
        for status in ReferralStatus:
            assert status in ALLOWED_TRANSITIONS

    @pytest.mark.parametrize(
        "src,dst",
        [
            (S.REQUESTED, S.UNDER_REVIEW),
            (S.REQUESTED, S.ACCEPTED),
            (S.REQUESTED, S.REJECTED),
            (S.REQUESTED, S.CANCELLED),
            (S.UNDER_REVIEW, S.ACCEPTED),
            (S.UNDER_REVIEW, S.REJECTED),
            (S.ACCEPTED, S.TRANSPORT_ARRANGED),
            (S.ACCEPTED, S.ARRIVED),  # direct arrival for untracked transport
            (S.TRANSPORT_ARRANGED, S.ACCEPTED),  # ambulance removed before departure
            (S.TRANSPORT_ARRANGED, S.EN_ROUTE),
            (S.EN_ROUTE, S.ARRIVED),
        ],
    )
    def test_permitted_transitions(self, src, dst):
        assert dst in ALLOWED_TRANSITIONS[src]

    @pytest.mark.parametrize(
        "src,dst",
        [
            (S.REQUESTED, S.EN_ROUTE),   # can't skip acceptance + transport
            (S.REQUESTED, S.ARRIVED),
            (S.ACCEPTED, S.REJECTED),    # can't reject an already-accepted request
            (S.EN_ROUTE, S.CANCELLED),   # no cancelling once under way
            (S.REJECTED, S.ACCEPTED),    # terminal
            (S.ARRIVED, S.EN_ROUTE),     # terminal, no going backwards
            (S.CANCELLED, S.REQUESTED),  # terminal
        ],
    )
    def test_forbidden_transitions(self, src, dst):
        assert dst not in ALLOWED_TRANSITIONS[src]

    @pytest.mark.parametrize("terminal", [S.ARRIVED, S.REJECTED, S.CANCELLED])
    def test_terminal_states_allow_no_further_transitions(self, terminal):
        assert ALLOWED_TRANSITIONS[terminal] == []

    def test_no_status_transitions_to_itself(self):
        for status, targets in ALLOWED_TRANSITIONS.items():
            assert status not in targets


class TestEnums:
    def test_referral_status_values_are_stable_strings(self):
        # These strings are persisted and shared with the frontend; guard them.
        assert S.REQUESTED.value == "REQUESTED"
        assert S.ACCEPTED.value == "ACCEPTED"
        assert S.EN_ROUTE.value == "EN_ROUTE"

    def test_arrival_conditions_cover_the_expected_outcomes(self):
        assert {c.value for c in ArrivalCondition} == {
            "STABLE",
            "CRITICAL",
            "DETERIORATED",
            "ARRIVED_DECEASED",
        }
