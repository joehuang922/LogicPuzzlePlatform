from __future__ import annotations

from pydantic import BaseModel


class PerfectLRingBoard(BaseModel):
    # rows x cols; 0 = empty, 1 = arrow up, 2 = right, 3 = down, 4 = left (as in L-Ring)
    cells: list[list[int]]
