"""AWS Lambda handler for puzzle image parsing (container-based, Function URL)."""
from __future__ import annotations

import json
import os
import sys
import traceback

print("=== Lambda handler module loading ===")
print(f"Python: {sys.version}")
print(f"LAMBDA_TASK_ROOT: {os.environ.get('LAMBDA_TASK_ROOT', '?')}")

HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}

_ocr = None
_parsers = None


def _init_parsers():
    """Lazy-initialize OCR and parsers on first real request."""
    global _ocr, _parsers
    if _parsers is not None:
        return

    print("=== Initializing OCR + parsers ===")

    from puzzle_parsers.combo_sudoku.ocr import EasyOcrBackend
    print("  - EasyOcrBackend imported")

    model_dir = os.environ.get("EASYOCR_MODULE_PATH")
    print(f"  - model_dir: {model_dir}")
    _ocr = EasyOcrBackend(model_storage_directory=model_dir)
    print("  - EasyOcrBackend initialized")

    from puzzle_parsers.sudoku.parser import SudokuParser
    print("  - SudokuParser imported")

    from puzzle_parsers.combo_sudoku.parser import ComboSudokuParser
    print("  - ComboSudokuParser imported")

    _parsers = {
        1: SudokuParser(ocr_backend=_ocr),
        2: ComboSudokuParser(ocr_backend=_ocr),
    }
    print("=== Parsers ready ===")


def handler(event, context):
    print(f"=== Handler invoked: method={event.get('requestContext', {}).get('http', {}).get('method', event.get('httpMethod', '?'))} ===")

    # Handle OPTIONS preflight for Function URL
    method = event.get("requestContext", {}).get("http", {}).get("method", event.get("httpMethod", ""))
    if method == "OPTIONS":
        return {"statusCode": 200, "headers": HEADERS, "body": ""}

    # Health check (GET or empty body)
    if not event.get("body"):
        return {
            "statusCode": 200,
            "headers": HEADERS,
            "body": json.dumps({
                "status": "ok",
                "python": sys.version,
                "task_root": os.environ.get("LAMBDA_TASK_ROOT", "?"),
            }),
        }

    try:
        import base64
        import cv2
        import numpy as np
        from PIL import Image

        body = json.loads(event["body"])
        image_b64 = body.get("image")
        puzzle_type = body.get("puzzleType")

        if not image_b64 or not puzzle_type:
            return {
                "statusCode": 400,
                "headers": HEADERS,
                "body": json.dumps({"error": "image (base64) and puzzleType are required"}),
            }

        print(f"  - puzzleType={puzzle_type}, image_len={len(image_b64)}")

        _init_parsers()

        image_bytes = base64.b64decode(image_b64)
        np_arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if img is None:
            return {
                "statusCode": 400,
                "headers": HEADERS,
                "body": json.dumps({"error": "Could not decode image"}),
            }

        print(f"  - image decoded: {img.shape}")
        pil_image = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))

        parser = _parsers.get(puzzle_type)
        if not parser:
            return {
                "statusCode": 400,
                "headers": HEADERS,
                "body": json.dumps({"error": f"Unsupported puzzle type: {puzzle_type}"}),
            }

        result = parser.parse(pil_image)
        print(f"  - parse complete")

        return {
            "statusCode": 200,
            "headers": HEADERS,
            "body": json.dumps({"canon": result.grid}),
        }

    except Exception as e:
        print(f"=== ERROR: {e} ===")
        traceback.print_exc()
        return {
            "statusCode": 500,
            "headers": HEADERS,
            "body": json.dumps({
                "error": str(e),
                "trace": traceback.format_exc(),
            }),
        }
