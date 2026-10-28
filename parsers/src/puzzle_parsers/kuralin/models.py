from __future__ import annotations

from pydantic import BaseModel


class KuralinCircle(BaseModel):
    dr: int
    dc: int
    color: int


class KuralinBoard(BaseModel):
    width: int
    height: int
    circles: list[KuralinCircle]
