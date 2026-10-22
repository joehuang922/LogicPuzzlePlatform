"""EasyOCR utility for single-digit recognition (offline fallback)."""
from __future__ import annotations

import cv2
from numpy.typing import NDArray


def ocr_read_digit(
    cell_roi: NDArray,
    reader: object,
    allowlist: str = "0123456789",
    empty_val: int = -1,
    multi_digit: bool = False,
) -> int:
    """Read a number from a cell ROI using EasyOCR.

    Adds padding before resizing to prevent edge-to-edge digits (especially
    "1") from being missed by the text detector.

    Args:
        cell_roi: Grayscale cell image.
        reader: EasyOCR Reader instance.
        allowlist: Characters to allow in recognition.
        empty_val: Value to return when no digit is detected.
        multi_digit: When True, return the full run of recognized digits as
            one integer (e.g. "11" -> 11) instead of just the first digit.
            Opt-in: single-digit callers keep the first-digit behaviour so
            their predictions are unchanged. Required by clue types whose
            values can exceed 9 (e.g. Double Choco).

    Returns:
        Recognized number as int, or empty_val if nothing detected.
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
    if multi_digit:
        digits = "".join(ch for ch in text if ch.isdigit())
        return int(digits) if digits else empty_val
    if text and text[0].isdigit():
        return int(text[0])
    return empty_val
