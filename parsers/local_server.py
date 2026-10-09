"""Local HTTP parser server for the Admin authoring workflow.

The deployed OCR parser runs as a container Lambda, but large scans (10+ MP)
blow its 2-minute timeout. Locally the same parsers finish in seconds, so for
single-image authoring we run them on this machine instead and point the
frontend at ``http://localhost:8000`` via ``VITE_PARSER_URL``.

This is a thin HTTP shell around the *exact* Lambda handler
(``lambda_handler.handler``): we adapt an incoming request into the Lambda
event shape, call the handler verbatim, and translate its response back. That
keeps the parse path identical to production — no second code path to maintain
— and only adds what the Function URL used to provide for us: CORS headers so
the Vite dev server (a different origin) can call us.

Run with::

    parsers/.venv/bin/python -m local_server            # from the parsers/ dir
    parsers/.venv/bin/python parsers/local_server.py     # from the repo root

EasyOCR-backed types parse fully offline. Types that read via Gemini (e.g.
kakuro) still need ``GEMINI_API_KEY`` in the environment, same as the Lambda.
"""
from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ``lambda_handler`` lives alongside this file (parsers/), not inside the
# installed ``puzzle_parsers`` package, so make sure its directory is importable
# regardless of the working directory the server is launched from.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lambda_handler import handler as lambda_handler  # noqa: E402

HOST = os.environ.get("PARSER_HOST", "127.0.0.1")
PORT = int(os.environ.get("PARSER_PORT", "8000"))

# Mirror the Function URL's permissive CORS so the frontend (any localhost port)
# can POST here from the browser.
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


class ParserRequestHandler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: str) -> None:
        payload = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        for key, value in CORS_HEADERS.items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self) -> None:  # noqa: N802 - stdlib naming
        # CORS preflight: headers only, no body.
        self.send_response(204)
        for key, value in CORS_HEADERS.items():
            self.send_header(key, value)
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802 - stdlib naming
        # Empty-body event triggers the handler's health check.
        result = lambda_handler({"httpMethod": "GET", "body": None}, None)
        self._send(result["statusCode"], result["body"])

    def do_POST(self) -> None:  # noqa: N802 - stdlib naming
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length).decode("utf-8") if length else ""
        event = {"httpMethod": "POST", "body": raw}
        try:
            result = lambda_handler(event, None)
            self._send(result["statusCode"], result["body"])
        except Exception as exc:  # noqa: BLE001 - surface any crash to the client
            self._send(500, json.dumps({"error": str(exc)}))

    def log_message(self, fmt: str, *args) -> None:
        # Compact one-line access log on stderr.
        sys.stderr.write(f"[parser] {self.address_string()} {fmt % args}\n")


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), ParserRequestHandler)
    print(f"EasyOCR parser listening on http://{HOST}:{PORT}")
    print("Point the frontend at it with VITE_PARSER_URL=http://localhost:"
          f"{PORT}  (Ctrl-C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down parser server.")
        server.shutdown()


if __name__ == "__main__":
    main()
