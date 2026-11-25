from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class YajilixClue(BaseModel):
    kind: Literal["L", "I", "X"]
    num: int
    dir: Literal["up", "down", "left", "right"]


class YajilixBoard(BaseModel):
    # rows x cols; None = empty cell
    cells: list[list[YajilixClue | None]]
