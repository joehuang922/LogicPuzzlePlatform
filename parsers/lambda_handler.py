"""AWS Lambda handler for puzzle image parsing (container-based)."""
from __future__ import annotations

import base64
import json
import traceback

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.combo_sudoku.ocr import EasyOcrBackend
from puzzle_parsers.combo_sudoku.parser import ComboSudokuParser
from puzzle_parsers.sudoku.parser import SudokuParser

ocr = EasyOcrBackend()

PARSERS = {
    1: SudokuParser(ocr_backend=ocr),
    2: ComboSudokuParser(ocr_backend=ocr),
}


def handler(event, context):
    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
    }

    try:
        body = json.loads(event.get("body") or "{}")
        image_b64 = body.get("image")
        puzzle_type = body.get("puzzleType")

        if not image_b64 or not puzzle_type:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": "image (base64) and puzzleType are required"}),
            }

        image_bytes = base64.b64decode(image_b64)
        np_arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if img is None:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": "Could not decode image"}),
            }

        pil_image = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))

        parser = PARSERS.get(puzzle_type)
        if not parser:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": f"Unsupported puzzle type: {puzzle_type}"}),
            }

        result = parser.parse(pil_image)

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({"canon": result.grid}),
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({
                "error": str(e),
                "trace": traceback.format_exc(),
            }),
        }
