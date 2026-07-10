"""CLI entry point: python -m puzzle_parsers.double_choco <image> [-o output.json]"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from puzzle_parsers.double_choco.parser import DoubleChocoParser


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Parse a double-choco puzzle image into JSON"
    )
    parser.add_argument("image", help="Path to the puzzle image file")
    parser.add_argument(
        "-o",
        "--output",
        help="Output JSON file path (default: stdout)",
        default=None,
    )
    parser.add_argument(
        "--debug",
        help="Directory to save intermediate debug images",
        default=None,
    )
    parser.add_argument(
        "--ocr",
        choices=["easyocr", "none"],
        default="easyocr",
        help="OCR backend for number recognition (default: easyocr)",
    )
    args = parser.parse_args()

    image_path = Path(args.image)
    if not image_path.exists():
        print(f"Error: Image file not found: {image_path}", file=sys.stderr)
        sys.exit(1)

    ocr_backend = None
    if args.ocr == "easyocr":
        from puzzle_parsers.combo_sudoku.ocr import EasyOcrBackend
        ocr_backend = EasyOcrBackend()

    dc_parser = DoubleChocoParser(ocr_backend=ocr_backend)
    board = dc_parser.parse_file(image_path, debug_dir=args.debug)

    output_json = json.dumps(board.model_dump(), indent=4)

    if args.output:
        output_path = Path(args.output)
        output_path.write_text(output_json + "\n")
        print(f"Output written to: {output_path}", file=sys.stderr)
    else:
        print(output_json)


if __name__ == "__main__":
    main()
