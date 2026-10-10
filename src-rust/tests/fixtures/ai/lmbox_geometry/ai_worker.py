#!/usr/bin/env python3
"""Explicit synthetic worker used only to test the public Rust task boundary."""
import json
from pathlib import Path
import sys
import time


def emit(value):
    print(json.dumps(value), flush=True)


envelope = json.loads(sys.stdin.readline())
request = envelope["request"]
workspace = Path(envelope["workspace"])
if request["operation"] == "inspect":
    if request["projectId"] == "slow-inspect":
        time.sleep(1)
    emit({"type": "result", "data": {"configured": True, "model": "protocol-fixture", "tools": []}})
    sys.exit(0)
mode = request["payload"].get("prompt", request["payload"].get("workflow", "fixture"))
emit({"type": "progress", "message": "Protocol fixture started"})
if mode == "wait":
    sys.stdin.readline()
    emit({"type": "error", "code": "cancelled", "message": "Fixture cancellation acknowledged"})
elif mode == "ignore-cancel":
    time.sleep(30)
elif mode == "missing-terminal":
    pass
elif mode == "duplicate-terminal":
    emit({"type": "result", "data": {"text": "fixture", "artifacts": []}})
    emit({"type": "result", "data": {"text": "duplicate fixture", "artifacts": []}})
elif mode == "oversized-frame":
    print("x" * (12 * 1024 * 1024 + 1), flush=True)
else:
    artifacts = workspace / "artifacts"
    artifacts.mkdir()
    name = "fixture.txt"
    if mode == "invalid-path":
        name = "../outside.txt"
    elif mode == "symlink":
        (workspace / "outside.txt").write_text("out of artifact scope", encoding="utf8")
        (artifacts / name).symlink_to(workspace / "outside.txt")
    elif mode == "oversized-artifact":
        with (artifacts / name).open("wb") as output:
            output.truncate(32 * 1024 * 1024 + 1)
    elif mode in ("empty-text", "empty-video"):
        (artifacts / name).write_bytes(b"")
    else:
        (artifacts / name).write_text("Fixture output for " + request["projectId"], encoding="utf8")
    emit({"type": "result", "data": {"text": "Identifiable protocol fixture", "artifacts": [
        {"id": name, "name": "fixture.txt", "mimeType": "video/mp4" if mode == "empty-video" else "text/plain"}
    ]}})
