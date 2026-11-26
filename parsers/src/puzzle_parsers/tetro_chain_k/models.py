from __future__ import annotations

from pydantic import BaseModel


class TetroChainKCircle(BaseModel):
    dr: int
    dc: int
    color: int  # 0 = white, 1 = black, 2 = gray


class TetroChainKBoard(BaseModel):
    width: int
    height: int
    circles: list[TetroChainKCircle]
