"""Best-effort title / author extraction from the page around a puzzle board.

Magazine and book scans print a small header next to each board: an ordinal
("4", "QUESTION 30"), sometimes a short title ("ふわふわゆらり"), and often the
setter's name after a 作 marker ("作●セダム"). Locating that header with CV is
brittle — it sits above, left of, or right of the board depending on the
publication — so we hand a vision LLM a crop of the page around the board, with
the board outlined in red, and ask it to transcribe the header.

The crop is generous on every side (headers live up to a board-height away, e.g.
a nonogram's "QUESTION 30" above its clue area) and the red outline is what
disambiguates when neighbouring puzzles' headers fall inside the crop.

Everything here is best effort: any failure yields empty metadata and must never
fail the parse. The result only pre-fills the editable title/author fields in
the Admin authoring flow, so a human always confirms it.
"""
from __future__ import annotations

import os
import unicodedata

import cv2
import numpy as np
from numpy.typing import NDArray
from PIL import Image

from puzzle_parsers.recognition import CellRecognizer

# Context kept around the board's bounding box on each side, as a fraction of
# the box's longer side.
CONTEXT_MARGIN = 0.6

# Long-side cap for the crop sent to the model. Large enough that a small
# "作●みのり" stays legible, small enough to keep image tokens bounded.
MAX_CROP_SIDE = 2048

MAX_TITLE_LEN = 60
MAX_AUTHOR_LEN = 40

METADATA_PROMPT = """\
This image is part of a puzzle magazine or book page. The puzzle outlined with \
a thick RED box is the target. Find the header printed next to the target \
puzzle (above it, to its left, or to its right; the box may be slightly off and \
include the header) and transcribe it.

Return JSON only, with exactly these keys:
{"number": string or null, "title_text": string or null, "author": string or null}

- "number": the puzzle's ordinal / question number, digits only \
(e.g. "4" for a black box with 4, "30" for "QUESTION 30").
- "title_text": a short title printed as the puzzle's name, if any \
(e.g. "ふわふわゆらり"). Not the number, not the puzzle genre name.
- "author": the puzzle setter's name. It usually follows a 作 marker \
("作●セダム" -> "セダム", "作・…", "作者 …") or "by …". Japanese or English.

Rules:
- Transcribe exactly as printed. Do not translate or romanize.
- Use null when a field is not printed. Never guess. Missing author is normal.
- Only use the header belonging to the RED-boxed puzzle. Neighbouring puzzles' \
headers (another number, another 作 line) are not it; a header just below the \
red box usually belongs to the next puzzle.
- These are NOT the title or author: quiz questions and answer options \
(e.g. "ロジックに現れた…"), prize / PRESENT boxes, corner or section names, \
page numbers, difficulty stars or faces, and reader comment signatures such as \
"(ジサシキシンゴウ 金沢市)" at the bottom of a page.
"""


def context_crop(image: NDArray, quad: NDArray) -> NDArray:
    """Crop the page around ``quad`` and outline the board in red.

    Args:
        image: BGR (or grayscale) page image the quad's coordinates refer to.
        quad: 4x2 array of the board's corners in ``image`` pixel coordinates.

    Returns:
        BGR crop, downscaled so its long side is at most ``MAX_CROP_SIDE``.
    """
    if image.ndim == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    h_img, w_img = image.shape[:2]
    pts = np.asarray(quad, dtype=np.float64).reshape(-1, 2)

    x0, y0 = pts.min(axis=0)
    x1, y1 = pts.max(axis=0)
    margin = CONTEXT_MARGIN * max(x1 - x0, y1 - y0)
    cx0 = int(max(0, x0 - margin))
    cy0 = int(max(0, y0 - margin))
    cx1 = int(min(w_img, x1 + margin))
    cy1 = int(min(h_img, y1 + margin))

    crop = image[cy0:cy1, cx0:cx1].copy()
    thickness = max(3, round(max(crop.shape[:2]) / 300))
    outline = (pts - [cx0, cy0]).round().astype(np.int32)
    cv2.polylines(crop, [outline], True, (0, 0, 255), thickness)

    scale = MAX_CROP_SIDE / max(crop.shape[:2])
    if scale < 1:
        crop = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    return crop


def _clean(value: object, max_len: int) -> str | None:
    if not isinstance(value, (str, int)) or isinstance(value, bool):
        return None
    text = " ".join(str(value).split())
    if not text or text.lower() in ("null", "none") or len(text) > max_len:
        return None
    return text


def metadata_from_response(raw: object) -> dict[str, str | None]:
    """Turn the model's JSON into ``{"title", "author"}``, dropping junk.

    The ordinal and the title text combine into one title ("30 ふわふわゆらり");
    either may be missing. A non-numeric "number" is discarded rather than
    trusted, since the prompt asks for digits only.
    """
    if not isinstance(raw, dict):
        return {"title": None, "author": None}

    number = _clean(raw.get("number"), 8)
    if number is not None:
        number = unicodedata.normalize("NFKC", number)
        if not number.isdigit():
            number = None
    title_text = _clean(raw.get("title_text"), MAX_TITLE_LEN)
    parts = [p for p in (number, title_text) if p]
    title = " ".join(parts) if parts else None

    return {"title": title, "author": _clean(raw.get("author"), MAX_AUTHOR_LEN)}


class MetadataExtractor:
    """Reads a board's title / author from the page with one vision-LLM call."""

    def __init__(self, recognizer: CellRecognizer) -> None:
        self._recognizer = recognizer

    def extract(self, crop: NDArray) -> dict[str, str | None]:
        """Read the header from a crop made by :func:`context_crop`."""
        rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        raw = self._recognizer.recognize_image(Image.fromarray(rgb), METADATA_PROMPT)
        return metadata_from_response(raw)


_default_extractor: MetadataExtractor | None = None
_default_failed = False


def default_metadata_extractor() -> MetadataExtractor | None:
    """The shared Gemini-backed extractor, or None when it's disabled/unavailable.

    Set ``PARSER_METADATA=0`` to turn extraction off. A missing SDK or API key
    disables it for the process instead of failing parses.
    """
    global _default_extractor, _default_failed
    if os.environ.get("PARSER_METADATA", "1") == "0" or _default_failed:
        return None
    if _default_extractor is None:
        try:
            from puzzle_parsers.recognition import GeminiRecognizer

            # One short JSON reply: a tight timeout and token cap keep a slow
            # call from holding the parse response back.
            recognizer = GeminiRecognizer(timeout=15.0, max_output_tokens=512)
        except Exception as exc:  # noqa: BLE001 - metadata must never break a parse
            print(f"  [metadata] extractor unavailable ({type(exc).__name__}: {exc})")
            _default_failed = True
            return None
        _default_extractor = MetadataExtractor(recognizer)
    return _default_extractor
