from __future__ import annotations

from pydantic import BaseModel


class WhimsicalKnightPoint(BaseModel):
    dr: int
    dc: int


class WhimsicalKnightBoard(BaseModel):
    rows: int
    cols: int
    gray: list[list[int]]
    circles: list[WhimsicalKnightPoint]
    squares: list[WhimsicalKnightPoint]
