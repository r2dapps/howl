#!/usr/bin/env python3
"""Static server for Howl. Sets WASM MIME and isolation headers for the local companion."""
from __future__ import annotations

import mimetypes
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = 5500

mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def translate_path(self, path: str) -> str:
        translated = super().translate_path(path)
        candidate = Path(translated)
        if candidate.exists():
            return translated
        parts = list(candidate.parts)
        try:
            idx = parts.index("resolve")
        except ValueError:
            return translated
        if idx + 1 >= len(parts):
            return translated
        fallback = Path(*parts[:idx], *parts[idx + 2 :])
        if fallback.exists():
            return str(fallback)
        return translated

    def end_headers(self) -> None:
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        path = (self.path or "").split("?", 1)[0]
        if path == "/" or path.endswith((".html", ".css", ".js", ".mjs")):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format: str, *args) -> None:
        print("[%s] %s" % (self.log_date_time_string(), format % args))


if __name__ == "__main__":
    url = f"http://{HOST}:{PORT}/"
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Howl  {url}")
    print("Leave this window open. Press Ctrl+C to stop.")
    webbrowser.open(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
