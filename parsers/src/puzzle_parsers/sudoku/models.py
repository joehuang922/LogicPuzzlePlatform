from __future__ import annotations

from pydantic import BaseModel


class SudokuBoard(BaseModel):
    """N x N hints (0 = empty). Rooms are room_width x room_height; N is their product.

    Both default to 3 (the standard 9x9) and are omitted from the canon then, so a 9x9
    board serializes exactly as before.
    """

    room_width: int = 3
    room_height: int = 3
    hints: list[list[int]]
