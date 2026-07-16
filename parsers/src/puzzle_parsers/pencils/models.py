from __future__ import annotations

from pydantic import BaseModel


class PencilsBoard(BaseModel):
    cells: list[list[int]]
