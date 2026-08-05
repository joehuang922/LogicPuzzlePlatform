from __future__ import annotations

from pydantic import BaseModel


class NumberLinkBoard(BaseModel):
    cells: list[list[int]]
