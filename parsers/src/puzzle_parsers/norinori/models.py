from __future__ import annotations

from pydantic import BaseModel


class NorinoriGrids(BaseModel):
    h: list[list[int]]
    v: list[list[int]]


class NorinoriBoard(BaseModel):
    grids: NorinoriGrids
