"""AWS Lambda handler for puzzle image parsing (container-based)."""
from __future__ import annotations

import json
import os
import sys

HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
}


def handler(event, context):
    # Health check — verify the container starts at all
    if not event.get("body"):
        return {
            "statusCode": 200,
            "headers": HEADERS,
            "body": json.dumps({
                "status": "ok",
                "python": sys.version,
                "cwd": os.getcwd(),
                "task_root": os.environ.get("LAMBDA_TASK_ROOT", "?"),
                "files": os.listdir(os.environ.get("LAMBDA_TASK_ROOT", "/var/task")),
            }),
        }

    import base64
    import traceback

    try:
        body = json.loads(event["body"])
        image_b64 = body.get("image")
        puzzle_type = body.get("puzzleType")

        if not image_b64 or not puzzle_type:
            return {
                "statusCode": 400,
                "headers": HEADERS,
                "body": json.dumps({"error": "image (base64) and puzzleType are required"}),
            }

        # Lazy import heavy deps
        import cv2
        import numpy as np
        from PIL import Image

        from puzzle_parsers.combo_sudoku.ocr import EasyOcrBackend
        from puzzle_parsers.combo_sudoku.parser import ComboSudokuParser
        from puzzle_parsers.sudoku.parser import SudokuParser

        model_dir = os.environ.get("EASYOCR_MODULE_PATH", None)
        ocr = EasyOcrBackend(model_storage_directory=model_dir)
        parsers = {
            1: SudokuParser(ocr_backend=ocr),
            2: ComboSudokuParser(ocr_backend=ocr),
        }

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
