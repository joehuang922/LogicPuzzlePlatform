"""CLI entry point: python -m puzzle_parsers.combo_sudoku <image> [-o output.json]"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from puzzle_parsers.combo_sudoku.grid_detector import CROSS_LAYOUT, DIAGONAL_LAYOUT
from puzzle_parsers.combo_sudoku.ocr import ClaudeOcrBackend, EasyOcrBackend, OcrBackend
from puzzle_parsers.combo_sudoku.parser import ComboSudokuParser


def _make_backend(name: str) -> OcrBackend:
    if name == "claude":
        return ClaudeOcrBackend()
    elif name == "easyocr":
        return EasyOcrBackend()
    else:
        raise ValueError(f"Unknown OCR backend: {name!r}. Choose 'claude' or 'easyocr'.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Parse a combo-sudoku puzzle image into JSON"
    )
    parser.add_argument("image", help="Path to the puzzle image file")
    parser.add_argument(
        "-o",
        "--output",
        help="Output JSON file path (default: stdout)",
        default=None,
    )
    parser.add_argument(
        "--backend",
        choices=["claude", "easyocr"],
        default="claude",
        help="OCR backend to use (default: claude)",
    )
    parser.add_argument(
        "--layout",
        choices=["cross", "diagonal", "auto"],
        default="auto",
        help="Layout type: cross, diagonal, or auto-detect (default: auto)",
    )
    parser.add_argument(
        "--debug",
        help="Directory to save intermediate debug images",
        default=None,
    )
    args = parser.parse_args()

    image_path = Path(args.image)
    if not image_path.exists():
        print(f"Error: Image file not found: {image_path}", file=sys.stderr)
        sys.exit(1)

    layout_map = {"cross": CROSS_LAYOUT, "diagonal": DIAGONAL_LAYOUT, "auto": None}
    layout = layout_map[args.layout]

    backend = _make_backend(args.backend)
    sudoku_parser = ComboSudokuParser(ocr_backend=backend, layout=layout)
    board = sudoku_parser.parse_file(image_path, debug_dir=args.debug)

    output_json = json.dumps(board.model_dump(), indent=4)

    if args.output:
        output_path = Path(args.output)
        output_path.write_text(output_json + "\n")
        print(f"Output written to: {output_path}", file=sys.stderr)
    else:
        print(output_json)


if __name__ == "__main__":
    main()
