from __future__ import annotations

from pydantic import BaseModel


class UnequalSudokuBoard(BaseModel):
    # 9x9, 0 = empty, 1-9 = given
    hints: list[list[int]]
    # 9x8: sign between (r, c) and (r, c+1); 0 none, 1 left smaller (<), 2 left larger (>)
    right: list[list[int]]
    # 8x9: sign between (r, c) and (r+1, c); 0 none, 1 upper smaller (∧), 2 upper larger (∨)
    down: list[list[int]]
