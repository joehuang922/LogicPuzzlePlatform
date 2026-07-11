"""Backward-compatible re-exports. Use llm_vision or ocr_utils directly."""
from puzzle_parsers.llm_vision import cells_to_png_bytes, parse_json_response
from puzzle_parsers.ocr_utils import ocr_read_digit

__all__ = ["cells_to_png_bytes", "ocr_read_digit", "parse_json_response"]
