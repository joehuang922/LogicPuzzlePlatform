from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class MajorityYajilixClue(BaseModel):
    kind: Literal["L", "I", "X"]
    dir: Literal["up", "down", "left", "right"]


class MajorityYajilixBoard(BaseModel):
    # rows x cols; None = empty cell
    cells: list[list[MajorityYajilixClue | None]]
