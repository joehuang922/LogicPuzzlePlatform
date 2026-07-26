from __future__ import annotations

from pydantic import BaseModel


class FillominoBoard(BaseModel):
    cells: list[list[int]]
