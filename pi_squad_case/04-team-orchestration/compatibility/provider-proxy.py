#!/usr/bin/env python3
"""Visible integration-only HTTP proxy; never records bodies or credentials.

Run in its own Herdr pane. --control is an ignored JSON file containing
{"failures": ["retry", "overflow"]}; each entry is consumed on the next formal
OpenAI chat request. Other requests and all successful streams reach upstream.
"""
import argparse
import hashlib
import http.client
import json
import pathlib
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--upstream", required=True)
parser.add_argument("--control", type=pathlib.Path, required=True)
parser.add_argument("--evidence", type=pathlib.Path, required=True)
parser.add_argument("--port", type=int, default=0)
args = parser.parse_args()
upstream = urlsplit(args.upstream)
if upstream.scheme != "http" or upstream.hostname != "127.0.0.1":
    parser.error("upstream must be the explicitly selected loopback model service")
lock = threading.Lock()
sequence = 0
HOP = {"connection", "transfer-encoding", "content-length", "host", "keep-alive"}


class Proxy(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_POST(self):
        global sequence
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        formal = b"<pi_squad_task>" in body
        identity = None
        try:
            messages = json.loads(body).get("messages", [])
            for message in messages:
                if message.get("role") not in ("system", "developer"):
                    continue
                match = re.search(r"<pi_squad_task>\n(.*?)\n</pi_squad_task>", message.get("content", ""), re.S)
                if match:
                    task = json.loads(match[1])
                    identity = {key: task.get(key) for key in ("task_id", "attempt_id", "segment_id")}
        except (ValueError, TypeError, AttributeError):
            pass
        with lock:
            sequence += 1
            seq = sequence
            fault = None
            if formal and args.control.exists():
                control = json.loads(args.control.read_text())
                failures = control.get("failures", [])
                if failures:
                    fault = failures.pop(0)
                    args.control.write_text(json.dumps({**control, "failures": failures}))
        status = None
        try:
            if fault:
                if fault not in ("retry", "overflow"):
                    raise ValueError("unknown provider fault")
                status = 503 if fault == "retry" else 400
                response = json.dumps({"error": {
                    "message": "Service temporarily unavailable" if fault == "retry" else "Requested token count exceeds the model's maximum context length of 128000 tokens",
                    "type": "server_error" if fault == "retry" else "invalid_request_error",
                    "code": "server_error" if fault == "retry" else "context_length_exceeded",
                }}).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(response)))
                self.end_headers()
                self.wfile.write(response)
            else:
                connection = http.client.HTTPConnection(upstream.hostname, upstream.port, timeout=180)
                try:
                    headers = {key: value for key, value in self.headers.items() if key.lower() not in HOP}
                    route = upstream.path.rstrip("/") + self.path
                    connection.request("POST", route, body, headers)
                    response = connection.getresponse()
                    status = response.status
                    self.send_response(status)
                    for key, value in response.getheaders():
                        if key.lower() not in HOP:
                            self.send_header(key, value)
                    self.end_headers()
                    while chunk := response.read1(65536):
                        self.wfile.write(chunk)
                        self.wfile.flush()
                finally:
                    connection.close()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            report = {"seq": seq, "at_unix": time.time(), "formal": formal,
                      "identity": identity, "request_sha256": hashlib.sha256(body).hexdigest(),
                      "request_bytes": len(body), "fault": fault, "status": status}
            with lock:
                args.evidence.parent.mkdir(parents=True, exist_ok=True)
                with args.evidence.open("a") as output:
                    output.write(json.dumps(report) + "\n")
            print(json.dumps(report), flush=True)


server = ThreadingHTTPServer(("127.0.0.1", args.port), Proxy)
print(json.dumps({"endpoint": f"http://127.0.0.1:{server.server_port}", "kind": "provider-fault-proxy"}), flush=True)
server.serve_forever()
