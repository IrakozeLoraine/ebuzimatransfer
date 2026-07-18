.PHONY: test test-unit test-integration loadtest

# Use the project venv's pytest if present, so the targets work whether or not
# the venv is activated; fall back to whatever pytest is on PATH.
PYTEST := $(shell [ -x .venv/bin/pytest ] && echo .venv/bin/pytest || echo pytest)

# Full suite with the 95% coverage gate (as configured in pytest.ini).
test:
	$(PYTEST)

# Unit tests only — pure logic, no database. Coverage gate disabled because a
# subset can't hit the whole-app 95% threshold.
test-unit:
	$(PYTEST) -m "not integration" --cov-fail-under=0

# Integration tests only — drive the FastAPI app against a live database.
test-integration:
	$(PYTEST) -m integration --cov-fail-under=0

PYTHON := $(shell [ -x .venv/bin/python ] && echo .venv/bin/python || echo python)

# Load test (response time vs. concurrent requests).
# Requires the API to be running. Pass credentials in:
#   make loadtest MEDICAL_ID=<MEDICAL_ID> PASSWORD='...'
loadtest:
	$(PYTHON) scripts/loadtest.py --medical-id "$(MEDICAL_ID)" --password "$(PASSWORD)"
