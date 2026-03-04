"""
Local web server that serves map_viewer.html and proxies requests to GeoServer.
This avoids all CORS issues by routing GeoServer requests through localhost.

Also provides a config API for persisting user settings to JSON files.

Usage: python serve_map.py
Then open: http://localhost:8000
"""

import http.server
import urllib.request
import urllib.error
import os
import sys
import json
import re
import uuid
from datetime import datetime, timedelta

GEOSERVER_URL = "http://13.58.149.42:8080/geoserver"
PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DIRECTORY = os.path.join(BASE_DIR, "frontend")
CONFIGS_DIR = os.path.join(BASE_DIR, "configs")
SHARES_DIR = os.path.join(CONFIGS_DIR, "shares")
SHARE_TTL_DAYS = 7

# Username must be alphanumeric + underscores only
SAFE_USERNAME_RE = re.compile(r'^[a-zA-Z0-9_]+$')
SAFE_SHARE_ID_RE = re.compile(r'^[a-zA-Z0-9]{8,64}$')


class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Prevent browser caching of static files (JS, CSS, HTML)
        if not self.path.startswith("/api/") and not self.path.startswith("/geoserver/"):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_GET(self):
        if self.path.startswith("/geoserver/"):
            self.proxy_to_geoserver()
        elif self.path.startswith("/api/config/"):
            self.handle_config_get()
        elif self.path.startswith("/api/share/"):
            self.handle_share_get()
        elif self.path.startswith("/share/"):
            self.path = "/share.html"
            super().do_GET()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/config/"):
            self.handle_config_post()
        elif self.path in ("/api/share", "/api/share/"):
            self.handle_share_post()
        else:
            self.send_response(404)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"Not found"}')

    def handle_config_get(self):
        username = self.path[len("/api/config/"):].split("?")[0]
        if not SAFE_USERNAME_RE.match(username):
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"Invalid username"}')
            return

        config_path = os.path.join(CONFIGS_DIR, username + ".json")
        if os.path.isfile(config_path):
            with open(config_path, "r", encoding="utf-8") as f:
                body = f.read().encode("utf-8")
        else:
            body = b'{}'

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def handle_config_post(self):
        username = self.path[len("/api/config/"):].split("?")[0]
        if not SAFE_USERNAME_RE.match(username):
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"Invalid username"}')
            return

        content_length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(content_length)
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"Invalid JSON"}')
            return

        os.makedirs(CONFIGS_DIR, exist_ok=True)
        config_path = os.path.join(CONFIGS_DIR, username + ".json")
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

        body = b'{"ok":true}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _json_response(self, code, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _cleanup_expired_shares(self):
        """Delete share files older than SHARE_TTL_DAYS."""
        if not os.path.isdir(SHARES_DIR):
            return
        cutoff = datetime.utcnow() - timedelta(days=SHARE_TTL_DAYS)
        for fname in os.listdir(SHARES_DIR):
            if not fname.endswith(".json"):
                continue
            fpath = os.path.join(SHARES_DIR, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                created = datetime.fromisoformat(data.get("created_at", "2000-01-01"))
                if created < cutoff:
                    os.remove(fpath)
            except Exception:
                pass

    def handle_share_post(self):
        content_length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(content_length)
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            self._json_response(400, {"error": "Invalid JSON"})
            return

        if "wsName" not in data or "wsConfig" not in data:
            self._json_response(400, {"error": "Missing wsName or wsConfig"})
            return

        data["created_at"] = datetime.utcnow().isoformat()
        share_id = uuid.uuid4().hex[:16]

        os.makedirs(SHARES_DIR, exist_ok=True)
        share_path = os.path.join(SHARES_DIR, share_id + ".json")
        with open(share_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

        # Cleanup old shares in background
        self._cleanup_expired_shares()

        self._json_response(200, {"id": share_id, "url": "/share/" + share_id})

    def handle_share_get(self):
        share_id = self.path[len("/api/share/"):].split("?")[0]
        if not SAFE_SHARE_ID_RE.match(share_id):
            self._json_response(400, {"error": "Invalid share ID"})
            return

        share_path = os.path.join(SHARES_DIR, share_id + ".json")
        if not os.path.isfile(share_path):
            self._json_response(404, {"error": "Share not found or expired"})
            return

        # Check expiry
        try:
            with open(share_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            created = datetime.fromisoformat(data.get("created_at", "2000-01-01"))
            if datetime.utcnow() - created > timedelta(days=SHARE_TTL_DAYS):
                os.remove(share_path)
                self._json_response(404, {"error": "Share expired"})
                return
        except Exception:
            pass

        with open(share_path, "r", encoding="utf-8") as f:
            body = f.read().encode("utf-8")

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def proxy_to_geoserver(self):
        target_url = GEOSERVER_URL + self.path[len("/geoserver"):]
        try:
            req = urllib.request.Request(target_url)
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read()
                self.send_response(resp.status)
                # Forward content type
                content_type = resp.headers.get("Content-Type", "application/octet-stream")
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", len(body))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            body = e.read()
            self.send_header("Content-Type", "text/plain")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            self.send_response(502)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(f"Proxy error: {e}".encode())

    def log_message(self, format, *args):
        # Cleaner log output
        sys.stdout.write(f"[{self.log_date_time_string()}] {args[0]}\n")


if __name__ == "__main__":
    server = http.server.HTTPServer(("0.0.0.0", PORT), ProxyHandler)
    print(f"Map server running at http://localhost:{PORT}")
    print(f"Proxying GeoServer requests to {GEOSERVER_URL}")
    print(f"User configs stored in {CONFIGS_DIR}")
    print("Press Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()
