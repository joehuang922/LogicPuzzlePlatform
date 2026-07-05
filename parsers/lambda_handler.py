"""AWS Lambda handler for puzzle image parsing (container-based)."""
from __future__ import annotations

import base64
import json
import os
import traceback

HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
}

_parsers = None


def _get_parsers():
    global _parsers
    if _parsers is not None:
        return _parsers

    import cv2  # noqa: F401
    import numpy as np  # noqa: F401
    from PIL import Image  # noqa: F401

    from puzzle_parsers.combo_sudoku.ocr import EasyOcrBackend
    from puzzle_parsers.combo_sudoku.parser import ComboSudokuParser
    from puzzle_parsers.sudoku.parser import SudokuParser

    model_dir = os.environ.get("EASYOCR_MODULE_PATH", None)
    ocr = EasyOcrBackend(model_storage_directory=model_dir)

    _parsers = {
        1: SudokuParser(ocr_backend=ocr),
        2: ComboSudokuParser(ocr_backend=ocr),
    }
    return _parsers


def handler(event, context):
    try:
        body = json.loads(event.get("body") or "{}")
        image_b64 = body.get("image")
        puzzle_type = body.get("puzzleType")

        if not image_b64 or not puzzle_type:
            return {
                "statusCode": 400,
                "headers": HEADERS,
                "body": json.dumps({"error": "image (base64) and puzzleType are required"}),
            }

        import cv2
        import numpy as np
        from PIL import Image

        image_bytes = base64.b64decode(image_b64)
        np_arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if img is None:
            return {
                "statusCode": 400,
                "headers": HEADERS,
                "body": json.dumps({"error": "Could not decode image"}),
            }

        pil_image = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))

        parsers = _get_parsers()
        parser = parsers.get(puzzle_type)
        if not parser:
            return {
                "statusCode": 400,
                "headers": HEADERS,
                "body": json.dumps({"error": f"Unsupported puzzle type: {puzzle_type}"}),
            }

        result = parser.parse(pil_image)

        return {
            "statusCode": 200,
            "headers": HEADERS,
            "body": json.dumps({"canon": result.grid}),
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "headers": HEADERS,
            "body": json.dumps({
                "error": str(e),
                "trace": traceback.format_exc(),
            }),
        }
