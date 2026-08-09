from __future__ import annotations

from pydantic import BaseModel


class HeyawakeRoom(BaseModel):
    r: int
    c: int
    w: int
    h: int
    clue: int | None = None


class HeyawakeBoard(BaseModel):
    width: int
    height: int
    rooms: list[HeyawakeRoom]
