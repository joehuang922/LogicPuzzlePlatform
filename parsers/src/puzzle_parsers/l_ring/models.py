from __future__ import annotations

from pydantic import BaseModel


class LRingBoard(BaseModel):
    # rows x cols; 0 = empty, 1 = arrow up, 2 = right, 3 = down, 4 = left
    cells: list[list[int]]
