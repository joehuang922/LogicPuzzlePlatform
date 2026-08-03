from __future__ import annotations

from pydantic import BaseModel


class LitsGrids(BaseModel):
    h: list[list[int]]
    v: list[list[int]]


class LitsBoard(BaseModel):
    grids: LitsGrids
