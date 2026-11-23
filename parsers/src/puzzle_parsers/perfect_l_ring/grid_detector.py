"""Perfect L-Ring grid detection.

The board is L-Ring's: a plain rectangular grid with dashed thin lines inside a solid
border, no rooms. The samples are phone photos of one magazine spread, each also showing
part of the other puzzle cut off at the page edge, so ``rectify_board`` (inside
``detect_l_ring_grid``) has to pick the one complete board.
"""
from __future__ import annotations

from numpy.typing import NDArray

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.l_ring.grid_detector import detect_l_ring_grid


def detect_perfect_l_ring_grid(image: NDArray, debug_dir: str | None = None) -> BoardGrid:
    """Detect the Perfect L-Ring grid: L-Ring's border, warp and dashed-line lattice."""
    return detect_l_ring_grid(image, debug_dir=debug_dir)
