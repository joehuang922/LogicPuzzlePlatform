from __future__ import annotations

from pydantic import BaseModel


class ChocoBananaBoard(BaseModel):
    cells: list[list[int]]
