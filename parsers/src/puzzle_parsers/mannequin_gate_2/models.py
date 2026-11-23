from __future__ import annotations

from pydantic import BaseModel


class MannequinGate2Board(BaseModel):
    rows: int
    cols: int
    # Each line lists every cell it passes through, in order, as [row, col].
    lines: list[list[list[int]]]
