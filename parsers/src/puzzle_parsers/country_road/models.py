from __future__ import annotations

from pydantic import BaseModel


class CountryRoadGrids(BaseModel):
    # (rows-1) x cols: 1 = wall below cell (r, c)
    h: list[list[int]]
    # rows x (cols-1): 1 = wall right of cell (r, c)
    v: list[list[int]]


class CountryRoadBoard(BaseModel):
    # rows x cols: 0 = no number, N >= 1 = the room's number printed in this cell
    cells: list[list[int]]
    grids: CountryRoadGrids
