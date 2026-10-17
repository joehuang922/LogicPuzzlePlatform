from __future__ import annotations

from pydantic import BaseModel


class HitoriBoard(BaseModel):
    cells: list[list[int]]
