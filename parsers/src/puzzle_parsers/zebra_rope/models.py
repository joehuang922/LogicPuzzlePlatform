from __future__ import annotations

from pydantic import BaseModel


class ZebraRopeCircle(BaseModel):
    dr: int
    dc: int
    color: int


class ZebraRopeBoard(BaseModel):
    width: int
    height: int
    ropes: list[list[list[int]]]
    circles: list[ZebraRopeCircle]
