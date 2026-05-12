from __future__ import annotations

from pydantic import BaseModel


class SubBoard(BaseModel):
    x: int
    y: int
    hints: list[list[int]]


class ComboSudokuBoard(BaseModel):
    room_width: int = 3
    room_height: int = 3
    subboards: list[SubBoard]
