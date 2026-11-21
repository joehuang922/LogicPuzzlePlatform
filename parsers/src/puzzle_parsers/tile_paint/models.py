from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class TilePaintClue(BaseModel):
    """A clue cell: shaded-cell counts of its run to the right and below (None = no number)."""

    right: Optional[int] = None
    down: Optional[int] = None


class TilePaintGrids(BaseModel):
    # (rows-1) x cols: 1 = wall below cell (r, c)
    h: list[list[int]]
    # rows x (cols-1): 1 = wall right of cell (r, c)
    v: list[list[int]]


class TilePaintBoard(BaseModel):
    # None = tile cell
    cells: list[list[Optional[TilePaintClue]]]
    grids: TilePaintGrids
