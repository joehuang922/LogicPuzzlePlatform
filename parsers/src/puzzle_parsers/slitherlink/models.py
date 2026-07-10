from __future__ import annotations

from pydantic import BaseModel


class SlitherlinkBoard(BaseModel):
    cells: list[list[int]]
