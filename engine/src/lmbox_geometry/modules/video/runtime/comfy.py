"""Bounded ComfyUI HTTP transport. Never invoke the global interrupt endpoint."""

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

from lmbox_geometry.contracts.ai import AiError

MAX_ARTIFACT = 32 * 1024 * 1024


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Comfy:
    def __init__(self):
        self.base = os.environ.get("LMBOX_COMFYUI_URL", "http://127.0.0.1:8188").rstrip("/")
        parsed = urllib.parse.urlsplit(self.base)
        if (
            parsed.scheme not in ("http", "https")
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
        ):
            raise AiError("invalid_configuration", "Invalid ComfyUI service URL.")
        self.key = os.environ.get("LMBOX_COMFYUI_API_KEY", "")
        self.partner_key = os.environ.get("LMBOX_COMFY_PARTNER_API_KEY", "")
        self.opener = urllib.request.build_opener(_NoRedirect)

    def request(self, path, body=None, binary=False, missing_ok=False):
        headers = {"Accept": "application/octet-stream" if binary else "application/json"}
        if self.key:
            headers["Authorization"] = "Bearer " + self.key
        data = None
        if body is not None:
            data = json.dumps(body, allow_nan=False).encode()
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self.base + path, data=data, headers=headers)
        limit = MAX_ARTIFACT if binary else 16 * 1024 * 1024
        try:
            with self.opener.open(request, timeout=15) as response:
                content = response.read(limit + 1)
            if len(content) > limit:
                raise AiError("provider_limit", "ComfyUI response exceeds the size limit.")
            if binary:
                return content
            return json.loads(content)
        except urllib.error.HTTPError as error:
            if missing_ok and error.code in (404, 405):
                return None
            if error.code in (401, 403):
                raise AiError("provider_auth", "ComfyUI rejected the configured credentials.")
            raise AiError("provider_error", f"ComfyUI returned HTTP {error.code}.") from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise AiError("provider_unavailable", "Cannot reach the configured ComfyUI service.")
        except (ValueError, UnicodeError):
            raise AiError("provider_error", "ComfyUI returned invalid JSON.") from None

    def metadata(self):
        result = self.request("/object_info")
        if not isinstance(result, dict) or not result:
            raise AiError("provider_error", "ComfyUI returned no available nodes.")
        return result

    def submit(self, prompt):
        body = {"prompt": prompt}
        if self.partner_key:
            body["extra_data"] = {"api_key_comfy_org": self.partner_key}
        try:
            result = self.request("/prompt", body)
        except AiError as error:
            if (
                error.code == "provider_unavailable"
                or str(error) == "ComfyUI returned invalid JSON."
            ):
                raise AiError(
                    "submission_unconfirmed",
                    "Workflow may already be running; inspect the ComfyUI queue "
                    "before submitting again.",
                ) from None
            raise
        prompt_id = result.get("prompt_id") if isinstance(result, dict) else None
        if not isinstance(prompt_id, str) or not prompt_id or result.get("node_errors"):
            raise AiError("invalid_workflow", "ComfyUI rejected the workflow inputs.")
        return prompt_id

    def credentials(self, is_credential):
        try:
            result = json.loads(os.environ.get("LMBOX_COMFY_NODE_CREDENTIALS", "{}"))
            valid = isinstance(result, dict) and all(
                isinstance(node, str)
                and isinstance(fields, dict)
                and all(
                    isinstance(name, str)
                    and is_credential(name)
                    and isinstance(value, str)
                    and value
                    for name, value in fields.items()
                )
                for node, fields in result.items()
            )
            if not valid:
                raise ValueError()
            if result:
                stats = self.request("/system_stats")
                arguments = (
                    stats.get("system", {}).get("argv", []) if isinstance(stats, dict) else []
                )
                if not isinstance(arguments, list) or "--disable-metadata" not in arguments:
                    raise AiError(
                        "unsafe_credential_metadata",
                        "Custom node credentials require ComfyUI --disable-metadata "
                        "to avoid embedding keys in outputs; use Partner authentication "
                        "instead or restart ComfyUI with that flag.",
                    )
            return result
        except ValueError:
            raise AiError(
                "invalid_configuration", "Invalid host node credential mapping."
            ) from None

    def history(self, prompt_id):
        result = self.request("/history/" + urllib.parse.quote(prompt_id, safe=""))
        if not isinstance(result, dict):
            raise AiError("provider_error", "ComfyUI returned invalid job history.")
        return result.get(prompt_id)

    def cancel(self, prompt_id):
        path_id = urllib.parse.quote(prompt_id, safe="")
        response = self.request("/api/jobs/" + path_id + "/cancel", {}, missing_ok=True)
        accepted = isinstance(response, dict) and response.get("cancelled") is True
        # Older releases can only remove queued prompts safely. Removing by ID is
        # race-safe even if that prompt starts running; never interrupt its successor.
        if not accepted:
            queue = self.request("/queue")
            pending = queue.get("queue_pending", []) if isinstance(queue, dict) else []
            if not any(
                isinstance(item, list) and len(item) > 1 and item[1] == prompt_id
                for item in pending
            ):
                return False
            self.request("/queue", {"delete": [prompt_id]})
        # Modern cancellation acknowledges dispatch only. Confirm that this local
        # ComfyUI job has actually stopped before reporting a cancelled terminal state.
        deadline = time.monotonic() + 2
        while True:
            history = self.history(prompt_id)
            if history:
                status = history.get("status", {})
                if any(
                    isinstance(item, list) and item and item[0] == "execution_interrupted"
                    for item in status.get("messages", [])
                ):
                    return True
                if status.get("completed") or status.get("status_str") in ("success", "error"):
                    return False
            queue = self.request("/queue")
            if not isinstance(queue, dict):
                return False
            pending, running = queue.get("queue_pending"), queue.get("queue_running")
            if not isinstance(pending, list) or not isinstance(running, list):
                return False
            if not any(
                isinstance(item, list) and len(item) > 1 and item[1] == prompt_id
                for item in pending + running
            ):
                return True
            if time.monotonic() >= deadline:
                return False
            time.sleep(0.1)

    def download(self, descriptor):
        if (
            not isinstance(descriptor, dict)
            or not isinstance(descriptor.get("filename"), str)
            or descriptor.get("type", "output") != "output"
        ):
            raise AiError("invalid_artifact", "ComfyUI returned an invalid output descriptor.")
        query = {
            "filename": descriptor["filename"],
            "type": "output",
            "subfolder": descriptor.get("subfolder", ""),
        }
        if not isinstance(query["subfolder"], str):
            raise AiError("invalid_artifact", "Invalid ComfyUI output folder.")
        return self.request("/view?" + urllib.parse.urlencode(query), binary=True)
