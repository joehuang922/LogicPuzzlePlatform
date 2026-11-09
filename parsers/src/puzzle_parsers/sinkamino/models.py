from __future__ import annotations

from pydantic import BaseModel


class SinkaminoBoard(BaseModel):
    # rows x cols; 0 = white, 1 = black, 2 = given square
    cells: list[list[int]]
    # trails, each an ordered list of [row, col] from tail to head
    arrows: list[list[list[int]]]
