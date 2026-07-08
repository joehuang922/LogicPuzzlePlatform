from __future__ import annotations

import base64
from abc import ABC, abstractmethod

import cv2
import numpy as np
from numpy.typing import NDArray

from puzzle_parsers.vision_utils import cells_to_png_bytes, parse_json_response


class OcrBackend(ABC):
    """Base class for OCR backends used by the combo-sudoku parser."""

    @abstractmethod
    def recognize_cells(self, cells: list[list[NDArray]]) -> list[list[int]]:
        """Recognize digits from a 9x9 grid of cell images.

        Returns a 9x9 array where each value is 0 (empty) or 1-9.
        """
        ...

    @abstractmethod
    def recognize_full_image(
        self, image_path: str, num_subboards: int
    ) -> list[list[list[int]]]:
        """Recognize all subboard digits from the full puzzle image.

        Returns a list of num_subboards 9x9 arrays.
        """
        ...

    @property
    @abstractmethod
    def supports_full_image(self) -> bool:
        """Whether this backend can process the full image in one shot."""
        ...




class ClaudeOcrBackend(OcrBackend):
    """OCR backend using Claude Vision API (paid, high accuracy)."""

    def __init__(self, client=None, model: str = "claude-sonnet-4-6-20250514") -> None:
        import anthropic

        self._client = client or anthropic.Anthropic()
        self._model = model

    @property
    def supports_full_image(self) -> bool:
        return True

    def recognize_cells(self, cells: list[list[NDArray]]) -> list[list[int]]:
        png_bytes = cells_to_png_bytes(cells)
        b64_image = base64.b64encode(png_bytes).decode("utf-8")
        grid_size = len(cells)

        response = self._client.messages.create(
            model=self._model,
            max_tokens=1024,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/png",
                                "data": b64_image,
                            },
                        },
                        {
                            "type": "text",
                            "text": (
                                f"This image shows a {grid_size}x{grid_size} grid of sudoku cells. "
                                "Each cell is labeled with its row,col position. "
                                "For each cell, identify the digit (1-9) if one is clearly printed, "
                                "or 0 if the cell is empty/blank. "
                                "Respond with ONLY a JSON array of arrays (9 rows of 9 integers). "
                                "Example: [[0,0,3,0,...],[...],...]. No explanation, just the JSON."
                            ),
                        },
                    ],
                }
            ],
        )

        return parse_json_response(response.content[0].text)

    def recognize_full_image(
        self, image_path: str, num_subboards: int
    ) -> list[list[list[int]]]:
        with open(image_path, "rb") as f:
            image_bytes = f.read()

        b64_image = base64.b64encode(image_bytes).decode("utf-8")
        media_type = "image/png" if image_path.lower().endswith(".png") else "image/jpeg"

        response = self._client.messages.create(
            model=self._model,
            max_tokens=4096,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": b64_image,
                            },
                        },
                        {
                            "type": "text",
                            "text": (
                                "This image shows a combo-sudoku puzzle with multiple overlapping "
                                "9x9 sudoku sub-boards arranged in a cross/plus pattern. "
                                f"There are {num_subboards} sub-boards. "
                                "For each sub-board (starting from the top, then left, right, bottom), "
                                "read all 9 rows of 9 cells. Output the digit (1-9) if a number is "
                                "printed in the cell, or 0 if the cell is empty. "
                                f"Respond with ONLY a JSON array of {num_subboards} sub-boards, "
                                "where each sub-board is an array of 9 rows, each row is an array of 9 integers. "
                                "Example: [[[0,0,0,...],[...],...], [[0,0,0,...],[...],...], ...]. "
                                "No explanation, just the JSON."
                            ),
                        },
                    ],
                }
            ],
        )

        return parse_json_response(response.content[0].text)


class EasyOcrBackend(OcrBackend):
    """OCR backend using EasyOCR (free, local, no API key needed)."""

    def __init__(self, languages: list[str] | None = None, model_storage_directory: str | None = None) -> None:
        import easyocr

        kwargs: dict = {"gpu": False}
        if model_storage_directory:
            kwargs["model_storage_directory"] = model_storage_directory
            kwargs["download_enabled"] = False
        self._reader = easyocr.Reader(languages or ["en"], **kwargs)

    @property
    def supports_full_image(self) -> bool:
        return False

    def _recognize_single_cell(self, cell: NDArray) -> int:
        gray = cell if len(cell.shape) == 2 else cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY)
        # Threshold to clean up the cell
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        # Check if cell has enough ink to contain a digit
        pixel_ratio = np.count_nonzero(thresh) / thresh.size
        if pixel_ratio < 0.03:
            return 0

        resized = cv2.resize(gray, (128, 128), interpolation=cv2.INTER_CUBIC)

        results = self._reader.readtext(
            resized,
            allowlist="123456789",
            detail=0,
            paragraph=False,
        )

        if not results:
            return 0

        text = results[0].strip()
        if len(text) == 1 and text.isdigit() and text != "0":
            return int(text)
        return 0

    def recognize_cells(self, cells: list[list[NDArray]]) -> list[list[int]]:
        grid: list[list[int]] = []
        for row in cells:
            row_digits = []
            for cell in row:
                digit = self._recognize_single_cell(cell)
                row_digits.append(digit)
            grid.append(row_digits)
        return grid

    def recognize_full_image(
        self, image_path: str, num_subboards: int
    ) -> list[list[list[int]]]:
        raise NotImplementedError(
            "EasyOCR does not support full-image recognition. "
            "Use grid detection mode (--grid-detect-only) with this backend."
        )
