from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class YajilinClue(BaseModel):
    dir: str
    num: int


class YajilinBoard(BaseModel):
    cells: list[list[Optional[YajilinClue]]]
