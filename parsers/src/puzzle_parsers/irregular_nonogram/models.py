from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class RowClue(BaseModel):
    row: int
    start: int
    side: Literal["start", "end"]
    clues: list[int]


class ColClue(BaseModel):
    col: int
    start: int
    side: Literal["start", "end"]
    clues: list[int]


class IrregularNonogramBoard(BaseModel):
    width: int
    height: int
    cells: list[list[int]]
    rowClues: list[RowClue]
    colClues: list[ColClue]
