from __future__ import annotations

from pydantic import BaseModel


class NonogramBoard(BaseModel):
    rowClues: list[list[int]]
    colClues: list[list[int]]
