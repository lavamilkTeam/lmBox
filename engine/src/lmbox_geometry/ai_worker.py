"""One-job JSONL process adapter. Rust owns job state, identity and workspaces."""

import contextlib
import json
import os
import sys
import threading
from pathlib import Path

from lmbox_geometry.contracts.ai import AiError, validate_ai_request
from lmbox_geometry.modules import agent, video

# Request and history have independent semantic limits. Allow JSON escaping of
# the 128 KiB transcript plus the host workspace and envelope around the request.
MAX_REQUEST_BYTES = 5 * 1024 * 1024


def main():
    protocol = sys.stdout

    def emit(value):
        protocol.write(json.dumps(value, ensure_ascii=False, allow_nan=False) + "\n")
        protocol.flush()

    cancel = threading.Event()

    def read_cancel(buffer):
        # Raw descriptor reads avoid holding Python's buffered stdin lock during
        # interpreter shutdown when this daemon is still waiting for host input.
        while True:
            while b"\n" in buffer:
                line, buffer = buffer.split(b"\n", 1)
                try:
                    if json.loads(line).get("type") == "cancel":
                        cancel.set()
                except (ValueError, AttributeError):
                    continue
            chunk = os.read(sys.stdin.fileno(), 4096)
            if not chunk:
                cancel.set()
                return
            buffer += chunk
            if len(buffer) > 4096:
                cancel.set()
                return

    try:
        buffer = b""
        while b"\n" not in buffer:
            chunk = os.read(sys.stdin.fileno(), 65536)
            if not chunk:
                break
            buffer += chunk
            if len(buffer) > MAX_REQUEST_BYTES:
                raise AiError("invalid_request", "AI request exceeds the size limit.")
        line, _, pending = buffer.partition(b"\n")
        envelope = json.loads(line)
        request = validate_ai_request(envelope["request"])
        workspace = envelope.get("workspace")
        if not isinstance(workspace, str) or not Path(workspace).is_absolute():
            raise AiError("invalid_request", "A host-owned absolute workspace is required.")
        threading.Thread(target=read_cancel, args=(pending,), daemon=True).start()

        def progress(message):
            emit({"type": "progress", "message": message})

        with contextlib.redirect_stdout(sys.stderr):
            if request["capability"] == "video":
                data = video.execute(request, Path(workspace), cancel, progress)
            else:
                data = agent.execute(
                    request, Path(workspace), cancel, progress, context=envelope.get("context")
                )
        emit({"type": "result", "data": data})
    except AiError as error:
        emit({"type": "error", "code": error.code, "message": str(error)})
    except (ValueError, KeyError, TypeError):
        emit({"type": "error", "code": "invalid_request", "message": "Invalid AI request."})
    except Exception:
        # Provider bodies, tokens and filesystem paths are never echoed through IPC.
        emit({"type": "error", "code": "worker_error", "message": "AI worker failed."})


if __name__ == "__main__":
    main()
