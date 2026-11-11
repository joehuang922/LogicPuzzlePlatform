from __future__ import annotations

from pydantic import BaseModel


class HashiBoard(BaseModel):
    # rows x cols lattice points; 0 = no island, 1-8 = an island with that number
    cells: list[list[int]]
