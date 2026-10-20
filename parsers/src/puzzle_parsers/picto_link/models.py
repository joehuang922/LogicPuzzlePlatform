from __future__ import annotations

from pydantic import BaseModel


class PictoLinkBoard(BaseModel):
    cells: list[list[int]]
