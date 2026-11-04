"""The shared result of locating a board and its grid.

Every rectangular-grid detector returns a ``BoardGrid``: the rectified board
image, the grid line positions on it, and (when known) where the board sits in
the source image. Row/column counts and cell sizes derive from the lines, so
they can never disagree with them.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np
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

    def point(self, dr: int, dc: int) -> tuple[float, float]:
        """Pixel (x, y) of a doubled coordinate.

        Doubled coordinates address cells, edges and corners on one lattice:
        even = on a grid line, odd = midway between two lines (a cell centre
        when both are odd).
        """
        return _from_doubled(self.v_lines, dc), _from_doubled(self.h_lines, dr)

    def doubled(self, x: float, y: float) -> tuple[float, float]:
        """Fractional doubled coordinate (dr, dc) of pixel (x, y); see ``point``."""
        return _to_doubled(self.h_lines, y), _to_doubled(self.v_lines, x)


def _from_doubled(lines: list[int], d: int) -> float:
    i, odd = divmod(d, 2)
    i = min(max(i, 0), len(lines) - 1)
    if odd and i + 1 < len(lines):
        return (lines[i] + lines[i + 1]) / 2
    return float(lines[i])


def _to_doubled(lines: list[int], pos: float) -> float:
    # Piecewise linear through the lines (line k sits at doubled 2k), extended
    # past the ends with the outer cells' pitch.
    xs = np.asarray(lines, dtype=float)
    ks = 2.0 * np.arange(len(lines))
    if pos < xs[0]:
        return float(2 * (pos - xs[0]) / (xs[1] - xs[0]))
    if pos > xs[-1]:
        return float(ks[-1] + 2 * (pos - xs[-1]) / (xs[-1] - xs[-2]))
    return float(np.interp(pos, xs, ks))
