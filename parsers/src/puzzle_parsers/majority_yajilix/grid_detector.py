"""Majority Yajilix grid detection: Yajilix's board (dashed thin lines, solid border, no
rooms) from the same magazine pages, so the same ``rectify_board`` + ``find_grid_lines``."""
from __future__ import annotations

from numpy.typing import NDArray

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.yajilix.grid_detector import detect_yajilix_grid


def detect_majority_yajilix_grid(image: NDArray, debug_dir: str | None = None) -> BoardGrid:
    """Detect the board: find border, warp, locate grid lines."""
    return detect_yajilix_grid(image, debug_dir=debug_dir)
