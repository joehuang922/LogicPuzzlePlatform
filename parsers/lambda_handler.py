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
}

_ocr = None
_parsers: dict = {}

# Puzzle types whose parsers need the local EasyOCR backend. Everything else
# either does OCR via the Gemini vision API or has no text to read, so it must
# not pay the ~7s EasyOCR model-load cost. Keep this in sync with the
# ``ocr_backend=`` arguments in ``_PARSER_FACTORIES``.
_OCR_TYPES = frozenset({1, 2, 4, 5, 7, 8, 14, 16, 17, 19, 20, 23, 24, 25})


def _get_ocr():
    """Lazily build the shared EasyOCR backend on first use by an OCR parser."""
    global _ocr
    if _ocr is None:
        from puzzle_parsers.recognition import EasyOcrBackend

        model_dir = os.environ.get("EASYOCR_MODULE_PATH")
        print(f"  === Initializing EasyOCR (model_dir={model_dir}) ===")
        _ocr = EasyOcrBackend(model_storage_directory=model_dir)
        print("  === EasyOCR initialized ===")
    return _ocr


def _build_parser(puzzle_type: int):
    """Construct a single parser on demand, importing only what it needs.

    EasyOCR is initialized only for puzzle types in ``_OCR_TYPES``; types like
    kakuro that read via the Gemini API (or have no text) skip that cost
    entirely, shaving several seconds off their cold-start latency.
    """
    ocr = _get_ocr() if puzzle_type in _OCR_TYPES else None

    if puzzle_type == 1:
        from puzzle_parsers.sudoku.parser import SudokuParser
        return SudokuParser(ocr_backend=ocr)
    if puzzle_type == 2:
        from puzzle_parsers.combo_sudoku.parser import ComboSudokuParser
        return ComboSudokuParser(ocr_backend=ocr)
    if puzzle_type == 3:
        from puzzle_parsers.nurimaze.parser import NurimazeParser
        return NurimazeParser()
    if puzzle_type == 4:
        from puzzle_parsers.double_choco.parser import DoubleChocoParser
        return DoubleChocoParser(ocr_backend=ocr)
    if puzzle_type == 5:
        from puzzle_parsers.slitherlink.parser import SlitherlinkParser
        return SlitherlinkParser(ocr_backend=ocr)
    if puzzle_type == 6:
        from puzzle_parsers.nonogram.parser import NonogramParser
        return NonogramParser()
    if puzzle_type == 7:
        from puzzle_parsers.masyu.parser import MasyuParser
        return MasyuParser(ocr_backend=ocr)
    if puzzle_type == 8:
        from puzzle_parsers.pencils.parser import PencilsParser
        return PencilsParser(ocr_backend=ocr)
    if puzzle_type == 9:
        from puzzle_parsers.nuritwin.parser import NuritwinParser
        return NuritwinParser()
    if puzzle_type == 10:
        from puzzle_parsers.slalom.parser import SlalomParser
        return SlalomParser()
    if puzzle_type == 11:
        from puzzle_parsers.shakashaka.parser import ShakashakaParser
        return ShakashakaParser()
    if puzzle_type == 12:
        from puzzle_parsers.kakuro.parser import KakuroParser
        return KakuroParser()
    if puzzle_type == 13:
        from puzzle_parsers.yajilin.parser import YajilinParser
        return YajilinParser()
    if puzzle_type == 14:
        from puzzle_parsers.fillomino.parser import FillominoParser
        return FillominoParser(ocr_backend=ocr)
    if puzzle_type == 15:
        from puzzle_parsers.lits.parser import LitsParser
        return LitsParser()
    if puzzle_type == 16:
        from puzzle_parsers.choco_banana.parser import ChocoBananaParser
        return ChocoBananaParser(ocr_backend=ocr)
    if puzzle_type == 17:
        from puzzle_parsers.number_link.parser import NumberLinkParser
        return NumberLinkParser(ocr_backend=ocr)
    if puzzle_type == 18:
        from puzzle_parsers.akari.parser import AkariParser
        return AkariParser()
    if puzzle_type == 19:
        from puzzle_parsers.hell_golf.parser import HellGolfParser
        return HellGolfParser(ocr_backend=ocr)
    if puzzle_type == 20:
        from puzzle_parsers.tentaishow.parser import TentaishowParser
        return TentaishowParser(ocr_backend=ocr)
    if puzzle_type == 21:
        from puzzle_parsers.heyawake.parser import HeyawakeParser
        return HeyawakeParser()
    if puzzle_type == 22:
        from puzzle_parsers.shikaku.parser import ShikakuParser
        return ShikakuParser()
    if puzzle_type == 23:
        from puzzle_parsers.norinori.parser import NorinoriParser
        return NorinoriParser(ocr_backend=ocr)
    if puzzle_type == 24:
        from puzzle_parsers.nurikabe.parser import NurikabeParser
        return NurikabeParser(ocr_backend=ocr)
    if puzzle_type == 25:
        from puzzle_parsers.ripple_effect.parser import RippleEffectParser
        return RippleEffectParser(ocr_backend=ocr)
    return None


def _get_parser(puzzle_type: int):
    """Return the parser for ``puzzle_type``, building and caching it on first use."""
    if puzzle_type not in _parsers:
        print(f"  === Building parser for type {puzzle_type} ===")
        parser = _build_parser(puzzle_type)
        if parser is None:
            return None
        _parsers[puzzle_type] = parser
        print(f"  === Parser {puzzle_type} ready ===")
    return _parsers[puzzle_type]


def handler(event, context):
    print(f"=== Handler invoked: method={event.get('requestContext', {}).get('http', {}).get('method', event.get('httpMethod', '?'))} ===")


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

        parser = _get_parser(puzzle_type)
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
