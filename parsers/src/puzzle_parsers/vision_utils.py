"""Shared vision utilities for puzzle parsers.

Provides reusable building blocks for LLM-based vision tasks:
- Composing cell images into labeled montage PNGs
- Parsing JSON responses from vision models
"""
from __future__ import annotations

import io
import json

import cv2
import numpy as np
from numpy.typing import NDArray
from PIL import Image


def cells_to_png_bytes(
    cells: list[list[NDArray]], max_tile_size: int = 64
) -> bytes:
    """Compose a grid of cell images into a single labeled PNG for batch recognition.

    Each cell is placed in a tile with a row,col label above it. Cells are
    downscaled if they exceed max_tile_size but never upscaled.

    Args:
        cells: 2D list of cell images (arbitrary rows x cols, grayscale or BGR).
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

    # Determine tile size: use native cell size, capped at max_tile_size
    sample = cells[0][0]
    native_h, native_w = sample.shape[:2]
    tile_size = min(max_tile_size, native_h, native_w)

    label_height = 16
    tile_h = tile_size + label_height
    tile_w = tile_size

    canvas_h = num_rows * tile_h
    canvas_w = num_cols * tile_w
    canvas = np.ones((canvas_h, canvas_w, 3), dtype=np.uint8) * 255

    for row in range(num_rows):
        for col in range(num_cols):
            cell = cells[row][col]
            ch, cw = cell.shape[:2]

            # Downscale only if exceeds tile_size
            if ch > tile_size or cw > tile_size:
                scale = min(tile_size / ch, tile_size / cw)
                new_w = int(cw * scale)
                new_h = int(ch * scale)
                resized = cv2.resize(cell, (new_w, new_h))
            else:
                resized = cell
                new_h, new_w = ch, cw

            if len(resized.shape) == 2:
                resized = cv2.cvtColor(resized, cv2.COLOR_GRAY2BGR)

            y_offset = row * tile_h + label_height
            x_offset = col * tile_w

            # Center the cell within the tile
            dy = (tile_size - new_h) // 2
            dx = (tile_size - new_w) // 2
            canvas[
                y_offset + dy: y_offset + dy + new_h,
                x_offset + dx: x_offset + dx + new_w,
            ] = resized

            label = f"{row},{col}"
            cv2.putText(
                canvas,
                label,
                (x_offset + 2, row * tile_h + label_height - 3),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.3,
                (100, 100, 100),
                1,
            )

    img = Image.fromarray(cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def ocr_read_digit(
    cell_roi: NDArray,
    reader: object,
    allowlist: str = "0123456789",
    empty_val: int = -1,
) -> int:
    """Read a single digit from a cell ROI using EasyOCR.

    Adds padding before resizing to prevent edge-to-edge digits (especially
    "1") from being missed by the text detector.

    Args:
        cell_roi: Grayscale cell image.
        reader: EasyOCR Reader instance.
        allowlist: Characters to allow in recognition.
        empty_val: Value to return when no digit is detected.

    Returns:
        Recognized digit as int, or empty_val if nothing detected.
    """
    padded = cv2.copyMakeBorder(cell_roi, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=255)
    resized = cv2.resize(padded, (128, 128), interpolation=cv2.INTER_CUBIC)
    results = reader.readtext(
        resized,
        allowlist=allowlist,
        detail=0,
        paragraph=False,
    )
    if not results:
        return empty_val

    text = "".join(results).strip()
    if text and text[0].isdigit():
        return int(text[0])
    return empty_val


def parse_json_response(text: str) -> object:
    """Parse a JSON response, stripping markdown code fences if present."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1])
    return json.loads(text)
