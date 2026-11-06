"""CLI entry point: python -m puzzle_parsers.combo_sudoku <image> [-o output.json]"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from puzzle_parsers.combo_sudoku.parser import ComboSudokuParser


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse a combo-sudoku puzzle image into JSON")
    parser.add_argument("image", help="Path to the puzzle image file")
    parser.add_argument("-o", "--output", default=None, help="Output JSON file (default: stdout)")
    parser.add_argument("--debug", default=None, help="Directory for intermediate debug images")
    args = parser.parse_args()

    image_path = Path(args.image)
    if not image_path.exists():
        print(f"Error: Image file not found: {image_path}", file=sys.stderr)
        sys.exit(1)

    board = ComboSudokuParser().parse_file(image_path, debug_dir=args.debug)
    output_json = json.dumps(board.model_dump(), indent=4)
    if args.output:
        Path(args.output).write_text(output_json + "\n")
        print(f"Output written to: {args.output}", file=sys.stderr)
    else:
        print(output_json)


if __name__ == "__main__":
    main()
