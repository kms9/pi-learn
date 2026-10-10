#!/usr/bin/env python3
"""Local stdio MCP permission fixture; logs method names, never message bodies."""
import json
import pathlib
import sys

log = pathlib.Path(sys.argv[1])
for line in sys.stdin:
    request = json.loads(line)
    method = request.get("method")
    with log.open("a") as stream:
        stream.write(json.dumps({"method": method}) + "\n")
    if "id" not in request:
        continue
    if method == "initialize":
        result = {"protocolVersion": request["params"]["protocolVersion"],
                  "capabilities": {"tools": {}},
                  "serverInfo": {"name": "squad-permission-fixture", "version": "1.0.0"}}
    elif method == "tools/list":
        result = {"tools": [{"name": "unapproved", "description": "Unapproved test tool",
                             "inputSchema": {"type": "object", "properties": {}}}]}
    elif method == "tools/call":
        result = {"content": [{"type": "text", "text": "UNAPPROVED_TRANSPORT_REACHED"}]}
    elif method == "ping":
        result = {}
    else:
        print(json.dumps({"jsonrpc": "2.0", "id": request["id"],
                          "error": {"code": -32601, "message": "Method not found"}}), flush=True)
        continue
    print(json.dumps({"jsonrpc": "2.0", "id": request["id"], "result": result}), flush=True)
