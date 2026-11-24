from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class MazeWalls(BaseModel):
    # (height - 1) x width: 1 = wall between (r, c) and (r + 1, c)
    h: list[list[int]]
    # height x (width - 1): 1 = wall between (r, c) and (r, c + 1)
    v: list[list[int]]


class MazeOpening(BaseModel):
    side: Literal["top", "bottom", "left", "right"]
    index: int


class PicturesqueMazeBoard(BaseModel):
    width: int
    height: int
    walls: MazeWalls
    entrance: MazeOpening
    exit: MazeOpening
