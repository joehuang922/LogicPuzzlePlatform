from __future__ import annotations

from pydantic import BaseModel


class ShakashakaBoard(BaseModel):
    cells: list[list[int]]
