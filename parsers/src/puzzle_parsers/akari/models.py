from __future__ import annotations

from pydantic import BaseModel


class AkariBoard(BaseModel):
    cells: list[list[int]]
