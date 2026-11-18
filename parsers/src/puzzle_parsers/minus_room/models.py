from __future__ import annotations

from pydantic import BaseModel


class MinusRoomEdges(BaseModel):
    h: list[list[int]]
    v: list[list[int]]


class MinusRoomCircle(BaseModel):
    dr: int
    dc: int
    value: int


class MinusRoomBoard(BaseModel):
    rows: int
    cols: int
    max: int
    cells: list[list[int]]
    edges: MinusRoomEdges
    circles: list[MinusRoomCircle]
