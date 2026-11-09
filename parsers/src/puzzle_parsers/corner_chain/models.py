from __future__ import annotations

from pydantic import BaseModel


class CornerChainBoard(BaseModel):
    cells: list[list[int]]
