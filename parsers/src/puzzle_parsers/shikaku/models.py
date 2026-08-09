from __future__ import annotations

from pydantic import BaseModel


class ShikakuBoard(BaseModel):
    cells: list[list[int]]
