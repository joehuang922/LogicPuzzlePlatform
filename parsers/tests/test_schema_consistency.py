"""Ensure Pydantic models stay consistent with canonical JSON Schemas."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from puzzle_parsers.sudoku.models import SudokuBoard
from puzzle_parsers.combo_sudoku.models import ComboSudokuBoard
from puzzle_parsers.nurimaze.models import NurimazeBoard
from puzzle_parsers.validate import validate_canon

SCHEMA_DIR = Path(__file__).parents[2] / "schemas" / "canon"

MODELS = {
    "sudoku": SudokuBoard,
    "combo-sudoku": ComboSudokuBoard,
    "nurimaze": NurimazeBoard,
}


@pytest.mark.parametrize("slug,model_cls", MODELS.items())
def test_pydantic_models_match_json_schema(slug, model_cls):
    schema_path = SCHEMA_DIR / f"{slug}.json"
    assert schema_path.exists(), f"Missing schema file: {schema_path}"

    canon_schema = json.loads(schema_path.read_text())
    pydantic_schema = model_cls.model_json_schema()

    canon_required = set(canon_schema.get("required", []))
    pydantic_required = set(pydantic_schema.get("required", []))
    assert canon_required == pydantic_required, (
        f"{slug}: required fields diverged — "
        f"canon={canon_required}, pydantic={pydantic_required}"
    )

    canon_props = set(canon_schema.get("properties", {}).keys())
    pydantic_props = set(pydantic_schema.get("properties", {}).keys())
    assert canon_props == pydantic_props, (
        f"{slug}: property keys diverged — "
        f"only in canon: {canon_props - pydantic_props}, "
        f"only in pydantic: {pydantic_props - canon_props}"
    )


def test_valid_sudoku_passes():
    data = {"hints": [[0] * 9 for _ in range(9)]}
    validate_canon("sudoku", data)


def test_invalid_sudoku_fails():
    data = {"hints": [[0] * 8 for _ in range(9)]}
    with pytest.raises(Exception):
        validate_canon("sudoku", data)


def test_valid_combo_sudoku_passes():
    data = {
        "room_width": 3,
        "room_height": 3,
        "subboards": [
            {"x": 0, "y": 0, "hints": [[0] * 9 for _ in range(9)]},
        ],
    }
    validate_canon("combo-sudoku", data)


def test_invalid_combo_sudoku_fails():
    data = {"subboards": [{"x": 0, "y": 0, "hints": [[0] * 9]}]}
    with pytest.raises(Exception):
        validate_canon("combo-sudoku", data)


def test_valid_nurimaze_passes():
    data = {
        "cells": [[0, 3], [4, 0]],
        "grids": {
            "h": [[0, 1]],
            "v": [[1], [0]],
        },
    }
    validate_canon("nurimaze", data)


def test_invalid_nurimaze_fails():
    data = {
        "cells": [[0, 5]],  # 5 is out of range
        "grids": {"h": [], "v": [[0]]},
    }
    with pytest.raises(Exception):
        validate_canon("nurimaze", data)
