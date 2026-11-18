from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class OminoTreeArrow(BaseModel):
    r: int
    c: int
    dir: Literal["up", "down", "left", "right"]


class OminoTreeBoard(BaseModel):
    rows: int
    cols: int
    numbers: list[list[int]]
    arrows: list[OminoTreeArrow]
