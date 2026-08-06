from __future__ import annotations

from pydantic import BaseModel


class HellGolfBall(BaseModel):
    r: int
    c: int
    n: int


class HellGolfBoard(BaseModel):
    lakes: list[list[int]]
    balls: list[HellGolfBall]
    goals: list[list[int]]
