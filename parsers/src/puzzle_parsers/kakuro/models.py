from __future__ import annotations

from typing import Literal, Optional, Union

from pydantic import BaseModel


class KakuroClueCell(BaseModel):
    type: Literal["clue"] = "clue"
    right: Optional[int] = None
    down: Optional[int] = None


class KakuroEmptyCell(BaseModel):
    type: Literal["empty"] = "empty"


KakuroCell = Union[KakuroClueCell, KakuroEmptyCell]


class KakuroBoard(BaseModel):
    cells: list[list[KakuroCell]]
