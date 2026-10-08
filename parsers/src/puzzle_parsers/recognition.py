"""Cell content recognition via LLM vision APIs.

Provides CellRecognizer ABC and concrete implementations (Gemini, Claude).
Parsers compose a cell montage and delegate recognition to a recognizer
with a prompt and expected response schema.
"""
from __future__ import annotations

import base64
import io
import math
from abc import ABC, abstractmethod
from concurrent.futures import ThreadPoolExecutor, as_completed

from numpy.typing import NDArray
from PIL import Image

from puzzle_parsers.llm_vision import cells_to_png_bytes, parse_json_response


def log_gemini_usage(response: object, model, *, label: str = "") -> None:
    """Emit a one-line token-usage ledger entry for a Gemini response.

    Prints prompt / output / thinking / total token counts. The ``google-genai``
    SDK itemises thinking as ``thoughts_token_count``; when that field is absent
    (e.g. an older response shape) we fall back to deriving it as
    ``total - prompt - output`` (clamped at 0). On OCR calls the thinking figure
    is the dominant cost driver, so logging it per call turns the Gemini bill
    from a monthly surprise into a summable, greppable ledger. The ``exact``
    marker records whether the thinking count came from the API or was derived.

    Lines are prefixed with ``[gemini-usage]`` for easy CloudWatch filtering.
    Never raises: usage telemetry must not break a parse.
    """
    try:
        usage = getattr(response, "usage_metadata", None)
        if usage is None:
            return
        prompt = int(getattr(usage, "prompt_token_count", 0) or 0)
        output = int(getattr(usage, "candidates_token_count", 0) or 0)
        total = int(getattr(usage, "total_token_count", 0) or 0)
        cached = int(getattr(usage, "cached_content_token_count", 0) or 0)
        reported = getattr(usage, "thoughts_token_count", None)
        if reported is not None:
            thinking = int(reported)
            exact = "y"
        else:
            # Older response shapes fold thinking into the billed total.
            thinking = max(0, total - prompt - output)
            exact = "n"
        model_name = getattr(model, "model_name", None) or str(model)
        print(
            f"  [gemini-usage] model={model_name} label={label or '-'} "
            f"prompt={prompt} output={output} thinking={thinking} "
            f"thinking_exact={exact} cached={cached} total={total}"
        )
    except Exception as exc:  # noqa: BLE001 - telemetry must never break a parse
        print(f"  [gemini-usage] (failed to read usage_metadata: {exc})")


def _split_rows(
    num_rows: int, num_cols: int, max_cells_per_batch: int
) -> list[tuple[int, int]]:
    """Partition rows into (start, end) spans for concurrent batch recognition.

    ``max_cells_per_batch // num_cols`` caps how many rows a single API call may
    carry. Rather than greedily filling batches to that cap — which leaves a fat
    first batch and a tiny trailing one (e.g. 22 rows -> 20 + 2) and so wastes the
    concurrency, since wall-clock tracks the largest batch — we pick the minimum
    number of batches that honours the cap and spread rows as evenly as possible
    across them (22 -> 11 + 11). Each batch's recognition latency scales with its
    cell count, so balanced batches minimise the slowest one.
    """
    rows_per_batch = max(1, max_cells_per_batch // num_cols)
    num_batches = max(1, math.ceil(num_rows / rows_per_batch))
    base, remainder = divmod(num_rows, num_batches)

    spans: list[tuple[int, int]] = []
    start = 0
    for i in range(num_batches):
        size = base + (1 if i < remainder else 0)
        spans.append((start, start + size))
        start += size
    return spans


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


class _GeminiModel:
    """Thin wrapper binding a ``google-genai`` client to one model name + config.

    The ``google-genai`` SDK dropped the old ``GenerativeModel`` object in favour
    of ``client.models.generate_content(model=..., config=...)``. This wrapper
    restores a ``model.generate_content(content)`` surface so the recognizer's
    timeout harness and the direct call in ``cell_classify`` need no special-
    casing, and exposes ``model_name`` for the usage logger.

    ``config`` carries ``thinking_config`` (set to ``thinking_budget=0`` for OCR,
    which is pure perception with no reasoning to do) and ``max_output_tokens``.
    Disabling thinking is the single biggest cost lever: thinking tokens bill at
    the output rate and dominated the historical spend.
    """

    def __init__(self, client, model_name: str, config) -> None:
        self._client = client
        self.model_name = model_name
        self._config = config

    def generate_content(self, content: list):
        return self._client.models.generate_content(
            model=self.model_name, contents=content, config=self._config
        )


class GeminiRecognizer(CellRecognizer):
    """Cell recognizer using Google Gemini Vision API.

    Each request is bounded by ``timeout`` seconds. If the primary model is slow
    (times out) or errors, the request is retried against ``fallback_model`` so a
    single sluggish call can't stall the whole parse. When an explicit ``client``
    is supplied (e.g. in tests) no fallback is attempted.

    Thinking is disabled (``thinking_budget=0``) on every call: these are OCR /
    cell-classification tasks with no multi-step reasoning, and thinking tokens
    were the dominant historical cost. ``max_output_tokens`` further caps the
    JSON reply so a runaway response can't balloon the bill.
    """

    def __init__(
        self,
        client=None,
        model: str = "gemini-3.8-flash",
        *,
        fallback_model: str = "gemini-2.5-flash",
        timeout: float = 50.0,
        thinking_budget: int = 0,
        max_output_tokens: int = 8192,
    ) -> None:
        import os

        self._timeout = timeout

        if client is not None:
            # Test / explicit injection: use the object as-is, no fallback.
            self._model = client
            self._fallback_model = None
            return

        from google import genai
        from google.genai import types

        api_key = os.environ.get("GEMINI_API_KEY")
        genai_client = genai.Client(api_key=api_key) if api_key else genai.Client()

        config = types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(thinking_budget=thinking_budget),
            max_output_tokens=max_output_tokens,
        )
        self._model = _GeminiModel(genai_client, model, config)
        self._fallback_model = (
            _GeminiModel(genai_client, fallback_model, config)
            if fallback_model
            else None
        )

    def _call_with_timeout(self, model, content: list, *, label: str = "") -> object:
        """Run one generate_content call under a hard wall-clock timeout.

        The SDK's own request timeout does not reliably interrupt a stalled
        connection (e.g. a proxy that holds the socket open), so we run the call
        on a daemon worker thread and abandon it if it overruns. Using a daemon
        thread (rather than a thread pool) ensures a wedged call cannot block
        process exit.
        """
        import threading

        result: dict[str, object] = {}

        def _run() -> None:
            try:
                result["value"] = model.generate_content(content)
            except Exception as exc:  # noqa: BLE001 - propagated to caller below
                result["error"] = exc

        worker = threading.Thread(target=_run, daemon=True)
        worker.start()
        worker.join(self._timeout)
        if worker.is_alive():
            raise TimeoutError(
                f"generate_content exceeded {self._timeout}s wall-clock timeout"
            )
        if "error" in result:
            raise result["error"]  # type: ignore[misc]
        response = result["value"]
        log_gemini_usage(response, model, label=label)
        return response

    def _generate(self, content: list) -> object:
        """Call the primary model with a timeout, falling back on slow/error.

        When the primary model is slow (exceeds the wall-clock timeout) or errors,
        we retry once against the fallback model before giving up. Both the
        primary and the fallback log their own usage line, so a timeout that
        triggers a fallback shows up as *two* billed calls in the ledger.
        """
        try:
            return self._call_with_timeout(self._model, content, label="primary")
        except Exception as primary_error:
            if self._fallback_model is None:
                raise
            print(
                f"  [GeminiRecognizer] primary model failed/slow "
                f"({type(primary_error).__name__}: {primary_error}); "
                f"retrying with fallback model"
            )
            return self._call_with_timeout(
                self._fallback_model, content, label="fallback"
            )

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

        batches = _split_rows(num_rows, num_cols, max_cells_per_batch)
        multi_batch = len(batches) > 1

        # Batches are independent API calls, so run them concurrently rather than
        # serially: the parse is bounded by the single slowest batch instead of
        # their sum. Each call already enforces its own wall-clock timeout, so a
        # pool of blocking threads is the simplest safe fan-out. Results are
        # written back by index to preserve row order.
        if len(batches) == 1:
            return self._recognize_batch(
                cells, prompt, num_cols, batches[0], multi_batch
            )

        batch_results: list[list[list] | None] = [None] * len(batches)
        with ThreadPoolExecutor(max_workers=len(batches)) as pool:
            futures = {
                pool.submit(
                    self._recognize_batch, cells, prompt, num_cols, span, multi_batch
                ): i
                for i, span in enumerate(batches)
            }
            for future in as_completed(futures):
                batch_results[futures[future]] = future.result()

        all_results: list[list] = []
        for result in batch_results:
            all_results.extend(result or [])
        return all_results

    def _recognize_batch(
        self,
        cells: list[list[NDArray]],
        prompt: str,
        num_cols: int,
        span: tuple[int, int],
        multi_batch: bool,
    ) -> list[list]:
        start_row, end_row = span
        batch_crops = cells[start_row:end_row]
        batch_rows = end_row - start_row

        png_bytes = cells_to_png_bytes(batch_crops, row_offset=start_row)
        montage_image = Image.open(io.BytesIO(png_bytes))

        batch_prompt = prompt
        if multi_batch:
            batch_prompt += (
                f"\n\nThis batch has {batch_rows} rows and {num_cols} columns "
                f"(rows {start_row} to {end_row - 1} of the full grid)."
            )

        response = self._generate([montage_image, batch_prompt])
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
        return batch_result

    def recognize_full_image(
        self,
        image_path: str,
        prompt: str,
    ) -> object:
        pil_image = Image.open(image_path)
        response = self._generate([pil_image, prompt])
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

            png_bytes = cells_to_png_bytes(batch_crops, row_offset=start_row)
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

        # Per-cell ``readtext`` is the dominant cost on large boards (measured
        # ~83s for a 720-cell fillomino on Lambda's ~1.7 vCPU, enough to blow the
        # timeout). ``readtext`` releases the GIL during torch inference, so we
        # dispatch cells across a thread pool in ``recognize_cells``. Pinning
        # torch to a single intra-op thread lets the pool — not torch's own
        # thread fan-out — own the parallelism, which gave the cleanest scaling
        # at low core counts (bit-identical output, just faster wall-clock).
        try:
            import torch

            torch.set_num_threads(1)
        except Exception:  # noqa: BLE001 - torch always present with easyocr; be defensive
            pass

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
        import os

        # Flatten to a single work-list so the thread pool load-balances across
        # all cells rather than one row at a time; reshape back at the end. The
        # result is identical to the serial path — only the wall-clock differs.
        flat: list[NDArray] = [cell for row in cells for cell in row]
        if not flat:
            return [[] for _ in cells]

        # Lambda allocates ~1 vCPU per 1769 MB; at 3008 MB (~1.7 vCPU) there is
        # little to gain past 3 workers, and oversubscribing just adds context-
        # switch overhead. Cap at a small number, scaled to the host but never
        # starving a tiny board of its one worker.
        max_workers = min(4, max(1, (os.cpu_count() or 2)))
        max_workers = min(max_workers, len(flat))

        if max_workers <= 1:
            flat_digits = [self._recognize_single_cell(c) for c in flat]
        else:
            with ThreadPoolExecutor(max_workers=max_workers) as pool:
                flat_digits = list(pool.map(self._recognize_single_cell, flat))

        grid: list[list[int]] = []
        idx = 0
        for row in cells:
            grid.append(flat_digits[idx : idx + len(row)])
            idx += len(row)
        return grid

    def recognize_full_image(
        self, image_path: str, num_subboards: int
    ) -> list[list[list[int]]]:
        raise NotImplementedError(
            "EasyOCR does not support full-image recognition. "
            "Use grid detection mode with this backend."
        )
