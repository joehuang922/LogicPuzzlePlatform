from __future__ import annotations

from pydantic import BaseModel


class DoubleChocoBoard(BaseModel):
    cells: list[list[list[int]]]
