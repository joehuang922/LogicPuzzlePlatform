"""CLI entry point: python -m puzzle_parsers.nonogram <image> [-o output.json]"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from puzzle_parsers.nonogram.parser import NonogramParser


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Parse a nonogram puzzle image into JSON"
    )
    parser.add_argument("image", help="Path to the puzzle image file")
    parser.add_argument(
        "-o",
        "--output",
        help="Output JSON file path (default: stdout)",
        default=None,
    )
    parser.add_argument(
        "--rows",
        type=int,
        default=10,
        help="Expected number of rows (default: 10)",
    )
    parser.add_argument(
        "--cols",
        type=int,
        default=10,
        help="Expected number of columns (default: 10)",
    )
    parser.add_argument(
        "--debug",
        help="Directory to save intermediate debug images",
        default=None,
    )
    parser.add_argument(
        "--ocr",
        choices=["gemini", "easyocr"],
        default="gemini",
        help="OCR backend for clue recognition (default: gemini)",
    )
    args = parser.parse_args()

    image_path = Path(args.image)
    if not image_path.exists():
        print(f"Error: Image file not found: {image_path}", file=sys.stderr)
        sys.exit(1)

    nono_parser = NonogramParser()
    board = nono_parser.parse_file(
        image_path,
        expected_rows=args.rows,
        expected_cols=args.cols,
        debug_dir=args.debug,
        ocr=args.ocr,
    )

    output_json = json.dumps(board.model_dump(), indent=4)

    if args.output:
        output_path = Path(args.output)
        output_path.write_text(output_json + "\n")
        print(f"Output written to: {output_path}", file=sys.stderr)
    else:
        print(output_json)


if __name__ == "__main__":
    main()
