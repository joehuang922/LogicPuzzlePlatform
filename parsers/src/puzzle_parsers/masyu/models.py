from __future__ import annotations

from pydantic import BaseModel


class MasyuBoard(BaseModel):
    cells: list[list[int]]
