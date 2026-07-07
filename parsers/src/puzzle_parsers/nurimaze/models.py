from __future__ import annotations

from pydantic import BaseModel


class NurimazeGrids(BaseModel):
    h: list[list[int]]
    v: list[list[int]]


class NurimazeBoard(BaseModel):
    cells: list[list[int]]
    grids: NurimazeGrids
