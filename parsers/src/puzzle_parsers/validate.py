from __future__ import annotations

import json
from pathlib import Path

from jsonschema import validate, ValidationError

SCHEMA_DIR = Path(__file__).parents[3] / "schemas" / "canon"

_schema_cache: dict[str, dict] = {}


def _load_schema(puzzle_type: str) -> dict:
    if puzzle_type not in _schema_cache:
        schema_path = SCHEMA_DIR / f"{puzzle_type}.json"
        if not schema_path.exists():
            raise FileNotFoundError(f"No schema for puzzle type: {puzzle_type}")
        _schema_cache[puzzle_type] = json.loads(schema_path.read_text())
    return _schema_cache[puzzle_type]


def validate_canon(puzzle_type: str, data: dict) -> None:
    """Validate canonical representation against its JSON Schema.

    Raises jsonschema.ValidationError on mismatch.
    """
    schema = _load_schema(puzzle_type)
    validate(instance=data, schema=schema)
