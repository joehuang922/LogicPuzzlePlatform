"""The shared result of locating a board and its grid.

Every rectangular-grid detector returns a ``BoardGrid``: the rectified board
image, the grid line positions on it, and (when known) where the board sits in
the source image. Row/column counts and cell sizes derive from the lines, so
they can never disagree with them.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
from numpy.typing import NDArray


@dataclass
class BoardGrid:
    warped: NDArray
    h_lines: list[int]
    v_lines: list[int]
    # Four source-image corners of the board (TL, TR, BR, BL), when known.
    quad: NDArray | None = None
    warped_gray: NDArray = field(default=None, repr=False)  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.warped_gray is None and self.warped is not None:
            self.warped_gray = (
                self.warped
                if self.warped.ndim == 2
                else cv2.cvtColor(self.warped, cv2.COLOR_BGR2GRAY)
            )

    @property
    def rows(self) -> int:
        return len(self.h_lines) - 1

    @property
    def cols(self) -> int:
        return len(self.v_lines) - 1

    @property
    def cell_h(self) -> float:
        rows = self.rows
        return (self.h_lines[-1] - self.h_lines[0]) / rows if rows > 0 else 1.0

    @property
    def cell_w(self) -> float:
        cols = self.cols
        return (self.v_lines[-1] - self.v_lines[0]) / cols if cols > 0 else 1.0
