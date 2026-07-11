"""Cell content recognition via LLM vision APIs.

Provides CellRecognizer ABC and concrete implementations (Gemini, Claude).
Parsers compose a cell montage and delegate recognition to a recognizer
with a prompt and expected response schema.
"""
from __future__ import annotations

import base64
import io
from abc import ABC, abstractmethod

from numpy.typing import NDArray
from PIL import Image

from puzzle_parsers.vision_utils import cells_to_png_bytes, parse_json_response


class CellRecognizer(ABC):
    """Base class for LLM-based cell content recognition."""

    @abstractmethod
    def recognize(
        self,
        cells: list[list[NDArray]],
        prompt: str,
        *,
        max_cells_per_batch: int = 200,
    ) -> list[list]:
        """Recognize cell contents from cropped cell images.

        Composes cells into a montage and sends to the vision model.
        For large grids, automatically batches by rows.

        Args:
            cells: 2D list of cell ROI images (grayscale or BGR).
            prompt: Recognition prompt describing what to extract.
            max_cells_per_batch: Max cells per API call (batches by rows if exceeded).

        Returns:
            2D list matching input dimensions, with recognized content per cell.
        """
        ...

    @abstractmethod
    def recognize_full_image(
        self,
        image_path: str,
        prompt: str,
    ) -> object:
        """Recognize content from the full puzzle image.

        Args:
            image_path: Path to the puzzle image file.
            prompt: Recognition prompt describing what to extract.

        Returns:
            Parsed JSON response (structure depends on the prompt).
        """
        ...

    @property
    @abstractmethod
    def supports_full_image(self) -> bool:
        """Whether this backend can process the full image in one shot."""
        ...


class GeminiRecognizer(CellRecognizer):
    """Cell recognizer using Google Gemini Vision API."""

    def __init__(self, client=None, model: str = "gemini-2.5-flash") -> None:
        import os

        import google.generativeai as genai

        if client is not None:
            self._model = client
        else:
            api_key = os.environ.get("GEMINI_API_KEY")
            if api_key:
                genai.configure(api_key=api_key)
            self._model = genai.GenerativeModel(model)

    @property
    def supports_full_image(self) -> bool:
        return True

    def recognize(
        self,
        cells: list[list[NDArray]],
        prompt: str,
        *,
        max_cells_per_batch: int = 200,
    ) -> list[list]:
        num_rows = len(cells)
        if num_rows == 0:
            return []
        num_cols = len(cells[0])
        if num_cols == 0:
            return []

        rows_per_batch = max(1, max_cells_per_batch // num_cols)
        all_results: list[list] = []

        for start_row in range(0, num_rows, rows_per_batch):
            end_row = min(start_row + rows_per_batch, num_rows)
            batch_crops = cells[start_row:end_row]
            batch_rows = end_row - start_row

            png_bytes = cells_to_png_bytes(batch_crops)
            montage_image = Image.open(io.BytesIO(png_bytes))

            batch_prompt = prompt
            if num_rows > rows_per_batch:
                batch_prompt += (
                    f"\n\nThis batch has {batch_rows} rows and {num_cols} columns "
                    f"(rows {start_row} to {end_row - 1} of the full grid)."
                )

            response = self._model.generate_content([montage_image, batch_prompt])
            batch_result = parse_json_response(response.text)

            if not isinstance(batch_result, list) or len(batch_result) != batch_rows:
                raise ValueError(
                    f"Expected {batch_rows} rows from Gemini (batch rows {start_row}-{end_row-1}), "
                    f"got {len(batch_result) if isinstance(batch_result, list) else type(batch_result)}"
                )
            for r, row in enumerate(batch_result):
                if not isinstance(row, list) or len(row) != num_cols:
                    raise ValueError(
                        f"Expected {num_cols} cols in row {start_row + r}, "
                        f"got {len(row) if isinstance(row, list) else type(row)}"
                    )
            all_results.extend(batch_result)

        return all_results

    def recognize_full_image(
        self,
        image_path: str,
        prompt: str,
    ) -> object:
        pil_image = Image.open(image_path)
        response = self._model.generate_content([pil_image, prompt])
        return parse_json_response(response.text)


class ClaudeRecognizer(CellRecognizer):
    """Cell recognizer using Anthropic Claude Vision API."""

    def __init__(self, client=None, model: str = "claude-sonnet-4-6-20250514") -> None:
        import anthropic

        self._client = client or anthropic.Anthropic()
        self._model = model

    @property
    def supports_full_image(self) -> bool:
        return True

    def recognize(
        self,
        cells: list[list[NDArray]],
        prompt: str,
        *,
        max_cells_per_batch: int = 200,
    ) -> list[list]:
        num_rows = len(cells)
        if num_rows == 0:
            return []
        num_cols = len(cells[0])
        if num_cols == 0:
            return []

        rows_per_batch = max(1, max_cells_per_batch // num_cols)
        all_results: list[list] = []

        for start_row in range(0, num_rows, rows_per_batch):
            end_row = min(start_row + rows_per_batch, num_rows)
            batch_crops = cells[start_row:end_row]
            batch_rows = end_row - start_row

            png_bytes = cells_to_png_bytes(batch_crops)
            b64_image = base64.b64encode(png_bytes).decode("utf-8")

            batch_prompt = prompt
            if num_rows > rows_per_batch:
                batch_prompt += (
                    f"\n\nThis batch has {batch_rows} rows and {num_cols} columns "
                    f"(rows {start_row} to {end_row - 1} of the full grid)."
                )

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
                                    "media_type": "image/png",
                                    "data": b64_image,
                                },
                            },
                            {"type": "text", "text": batch_prompt},
                        ],
                    }
                ],
            )

            batch_result = parse_json_response(response.content[0].text)

            if not isinstance(batch_result, list) or len(batch_result) != batch_rows:
                raise ValueError(
                    f"Expected {batch_rows} rows from Claude (batch rows {start_row}-{end_row-1}), "
                    f"got {len(batch_result) if isinstance(batch_result, list) else type(batch_result)}"
                )
            for r, row in enumerate(batch_result):
                if not isinstance(row, list) or len(row) != num_cols:
                    raise ValueError(
                        f"Expected {num_cols} cols in row {start_row + r}, "
                        f"got {len(row) if isinstance(row, list) else type(row)}"
                    )
            all_results.extend(batch_result)

        return all_results

    def recognize_full_image(
        self,
        image_path: str,
        prompt: str,
    ) -> object:
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
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )

        return parse_json_response(response.content[0].text)


class OcrBackend(ABC):
    """Legacy interface for backward compatibility.

    Wraps CellRecognizer with IntCell schema. Existing parsers can continue
    using this until they migrate to CellRecognizer directly.
    """

    @abstractmethod
    def recognize_cells(self, cells: list[list[NDArray]]) -> list[list[int]]:
        """Recognize digits from a grid of cell images.

        Returns a 2D array where each value is 0 (empty) or 1-9.
        """
        ...

    @abstractmethod
    def recognize_full_image(
        self, image_path: str, num_subboards: int
    ) -> list[list[list[int]]]:
        """Recognize all subboard digits from the full puzzle image."""
        ...

    @property
    @abstractmethod
    def supports_full_image(self) -> bool:
        """Whether this backend can process the full image in one shot."""
        ...


class GeminiOcrBackend(OcrBackend):
    """Gemini-based OCR backend for digit recognition (default)."""

    def __init__(self, client=None, model: str = "gemini-2.5-flash") -> None:
        from puzzle_parsers.recognition_schemas import INT_CELL_PROMPT

        self._recognizer = GeminiRecognizer(client=client, model=model)
        self._prompt = INT_CELL_PROMPT

    @property
    def supports_full_image(self) -> bool:
        return True

    def recognize_cells(self, cells: list[list[NDArray]]) -> list[list[int]]:
        return self._recognizer.recognize(cells, self._prompt)

    def recognize_full_image(
        self, image_path: str, num_subboards: int
    ) -> list[list[list[int]]]:
        prompt = (
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
        )
        return self._recognizer.recognize_full_image(image_path, prompt)


class ClaudeOcrBackend(OcrBackend):
    """Claude-based OCR backend for digit recognition."""

    def __init__(self, client=None, model: str = "claude-sonnet-4-6-20250514") -> None:
        from puzzle_parsers.recognition_schemas import INT_CELL_PROMPT

        self._recognizer = ClaudeRecognizer(client=client, model=model)
        self._prompt = INT_CELL_PROMPT

    @property
    def supports_full_image(self) -> bool:
        return True

    def recognize_cells(self, cells: list[list[NDArray]]) -> list[list[int]]:
        return self._recognizer.recognize(cells, self._prompt)

    def recognize_full_image(
        self, image_path: str, num_subboards: int
    ) -> list[list[list[int]]]:
        prompt = (
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
        )
        return self._recognizer.recognize_full_image(image_path, prompt)


class EasyOcrBackend(OcrBackend):
    """OCR backend using EasyOCR (free, local, no API key needed)."""

    def __init__(
        self, languages: list[str] | None = None, model_storage_directory: str | None = None
    ) -> None:
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
        import cv2
        import numpy as np

        gray = cell if len(cell.shape) == 2 else cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

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
            "Use grid detection mode with this backend."
        )
