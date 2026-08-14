from __future__ import annotations

from pydantic import BaseModel


class NurikabeBoard(BaseModel):
    cells: list[list[int]]
