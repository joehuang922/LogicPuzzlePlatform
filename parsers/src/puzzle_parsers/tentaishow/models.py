from __future__ import annotations

from pydantic import BaseModel


class TentaishowDot(BaseModel):
    dr: int
    dc: int
    color: int


class TentaishowBoard(BaseModel):
    width: int
    height: int
    dots: list[TentaishowDot]
