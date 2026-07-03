"""Rwanda administrative hierarchy: Province → District → Sector → Cell → Village.

This is the **seed source** for the ``locations`` table (see ``seeds.seed_locations``):
the app queries the database at runtime, not this module. The shape exposed by
``LOCATIONS`` is::

    LOCATIONS[province][district][sector][cell] -> list[str] of villages

The data itself lives in the sibling ``rwanda_locations.json`` file — the full,
official hierarchy of **5 provinces, 30 districts, 416 sectors, 2,148 cells and
14,837 villages (imidugudu)**.

Source: https://github.com/ngabovictor/Rwanda (``data.json``), which mirrors the
NISR administrative divisions. To refresh coverage, replace the JSON with an
updated official dataset of the same shape and re-run the seed.
"""

import json
from pathlib import Path

_DATA_FILE = Path(__file__).with_name("rwanda_locations.json")

with _DATA_FILE.open(encoding="utf-8") as _f:
    # LOCATIONS[province][district][sector][cell] -> list[str] villages
    LOCATIONS: dict[str, dict] = json.load(_f)
