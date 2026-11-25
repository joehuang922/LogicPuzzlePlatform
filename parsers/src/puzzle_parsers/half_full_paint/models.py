from __future__ import annotations

from pydantic import BaseModel


class HalfFullPaintCircle(BaseModel):
    dr: int
    dc: int
    color: int  # 0 = white, 1 = black, 2 = gray


class HalfFullPaintGrids(BaseModel):
    h: list[list[int]]  # (height-1) x width; 1 = wall between (r, c) and (r+1, c)
    v: list[list[int]]  # height x (width-1); 1 = wall between (r, c) and (r, c+1)


class HalfFullPaintBoard(BaseModel):
    width: int
    height: int
    grids: HalfFullPaintGrids
    circles: list[HalfFullPaintCircle]
