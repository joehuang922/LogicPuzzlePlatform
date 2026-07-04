from __future__ import annotations

from pydantic import BaseModel


class SudokuBoard(BaseModel):
    hints: list[list[int]]
