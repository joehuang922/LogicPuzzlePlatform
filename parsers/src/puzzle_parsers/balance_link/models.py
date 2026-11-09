from __future__ import annotations

from pydantic import BaseModel


class BalanceLinkBoard(BaseModel):
    # rows x cols; 0 = white, 1 = black, 10-71 = symbol (tens = shape, ones = 0 white / 1 black)
    cells: list[list[int]]
