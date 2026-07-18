from __future__ import annotations

from pydantic import BaseModel


class NuritwinGrids(BaseModel):
    h: list[list[int]]
    v: list[list[int]]


class NuritwinBoard(BaseModel):
    cells: list[list[int]]
    grids: NuritwinGrids
