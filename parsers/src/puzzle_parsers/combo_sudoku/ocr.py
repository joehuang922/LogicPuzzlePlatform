"""Backward-compatible re-exports. Use puzzle_parsers.recognition directly."""
from puzzle_parsers.recognition import (
    ClaudeOcrBackend,
    EasyOcrBackend,
    GeminiOcrBackend,
    OcrBackend,
)

__all__ = ["ClaudeOcrBackend", "EasyOcrBackend", "GeminiOcrBackend", "OcrBackend"]
