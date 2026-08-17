from __future__ import annotations

from pydantic import BaseModel


class RippleEffectEdges(BaseModel):
    h: list[list[int]]
    v: list[list[int]]


class RippleEffectBoard(BaseModel):
    cells: list[list[int]]
    edges: RippleEffectEdges
