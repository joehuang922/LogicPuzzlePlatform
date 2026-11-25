from __future__ import annotations

from pydantic import BaseModel


class MelonPieCircle(BaseModel):
    r: int  # point row, 0..height
    c: int  # point column, 0..width
    color: int  # 0 = white, 1 = black, 2 = gray


class MelonPieBoard(BaseModel):
    width: int  # cells across
    height: int  # cells down
    circles: list[MelonPieCircle]
