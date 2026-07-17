"""LLM vision helpers for puzzle parsers.

Provides utilities for preparing cell images for LLM-based recognition
and parsing structured responses from vision models.
"""
from __future__ import annotations

import io
import json

import cv2
import numpy as np
from numpy.typing import NDArray
from PIL import Image


def cells_to_png_bytes(
    cells: list[list[NDArray]], max_tile_size: int = 64,
    row_offset: int = 0, col_offset: int = 0,
) -> bytes:
    """Compose a grid of cell images into a single labeled PNG for batch recognition.

    Each cell is placed inside a red border with a coordinate label above it.
    The border provides clear spatial anchoring for LLMs to attribute content
    to the correct cell position.

    Args:
        cells: 2D list of cell ROI images (arbitrary rows x cols, grayscale or BGR).
        max_tile_size: Maximum tile dimension. Cells larger than this are
            downscaled to fit; smaller cells are kept at native size.

    Returns:
        PNG image bytes of the composed montage.
    """
    num_rows = len(cells)
    if num_rows == 0:
        return b""
    num_cols = len(cells[0])
    if num_cols == 0:
        return b""

    sample = cells[0][0]
    native_h, native_w = sample.shape[:2]
    tile_size = min(max_tile_size, native_h, native_w)

    border = 2
    label_h = 14
    cell_w = tile_size + border * 2
    cell_h = tile_size + border * 2 + label_h

    canvas_h = num_rows * cell_h
    canvas_w = num_cols * cell_w
    canvas = np.ones((canvas_h, canvas_w, 3), dtype=np.uint8) * 255

    for row in range(num_rows):
        for col in range(num_cols):
            cell = cells[row][col]
            ch, cw = cell.shape[:2]

            x0 = col * cell_w
            y0 = row * cell_h

            # Coordinate label in blue, centered above the cell
            label = f"{row + row_offset},{col + col_offset}"
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.35, 1)
            label_x = x0 + (cell_w - tw) // 2
            cv2.putText(
                canvas, label,
                (label_x, y0 + label_h - 2),
                cv2.FONT_HERSHEY_SIMPLEX, 0.35, (200, 0, 0), 1,
            )

            # Red border around the cell area
            bx0 = x0
            by0 = y0 + label_h
            bx1 = x0 + cell_w - 1
            by1 = y0 + cell_h - 1
            cv2.rectangle(canvas, (bx0, by0), (bx1, by1), (0, 0, 200), border)

            # Place cell image inside the border
            if ch > tile_size or cw > tile_size:
                scale = min(tile_size / ch, tile_size / cw)
                resized = cv2.resize(cell, (int(cw * scale), int(ch * scale)))
            else:
                resized = cell

            if len(resized.shape) == 2:
                resized = cv2.cvtColor(resized, cv2.COLOR_GRAY2BGR)

            new_h, new_w = resized.shape[:2]
            dy = (tile_size - new_h) // 2
            dx = (tile_size - new_w) // 2
            py = by0 + border + dy
            px = bx0 + border + dx
            canvas[py:py + new_h, px:px + new_w] = resized

    img = Image.fromarray(cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def parse_json_response(text: str) -> object:
    """Parse a JSON response, stripping markdown code fences if present."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1])
    return json.loads(text)
