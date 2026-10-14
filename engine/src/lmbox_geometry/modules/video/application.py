"""Coordinate graph validation, remote execution and local job artifacts."""

import time

from lmbox_geometry.contracts.ai import AiError

from .features import credential_field, definitions, to_prompt
from .runtime.artifacts import read_artifact, save_outputs
from .runtime.comfy import Comfy


def execute(request, workspace, cancel, progress):
    operation = request["operation"]
    payload = request.get("payload", {})
    if operation == "artifact":
        return read_artifact(workspace, payload.get("artifactId"))
    provider = Comfy()
    metadata = provider.metadata()
    if operation == "inspect":
        return {"configured": True, "nodes": definitions(metadata)}
    prompt = to_prompt(payload.get("workflow"), metadata, provider.credentials(credential_field))
    if cancel.is_set():
        raise AiError("cancelled", "Video job was cancelled before submission.")
    prompt_id = provider.submit(prompt)
    progress("Workflow queued in ComfyUI.")
    deadline = time.monotonic() + 7200
    try:
        while time.monotonic() < deadline:
            history = provider.history(prompt_id)
            if history:
                status = history.get("status", {})
                messages = status.get("messages", [])
                if any(
                    isinstance(item, list) and item and item[0] == "execution_interrupted"
                    for item in messages
                ):
                    raise AiError(
                        "cancelled", "Local ComfyUI job cancelled; cloud execution may continue."
                    )
                if status.get("status_str") == "error":
                    raise AiError(
                        "execution_failed", "ComfyUI failed while executing the workflow."
                    )
                if status.get("completed") is True or status.get("status_str") == "success":
                    progress("Downloading workflow outputs.")
                    artifacts = save_outputs(
                        workspace, history.get("outputs", {}), provider.download
                    )
                    return {"artifacts": artifacts}
            if cancel.is_set():
                if provider.cancel(prompt_id):
                    raise AiError(
                        "cancelled", "Local ComfyUI job cancelled; cloud execution may continue."
                    )
                raise AiError(
                    "cancellation_unconfirmed",
                    "Local ComfyUI cancellation is unconfirmed; cloud execution may continue.",
                )
            cancel.wait(0.5)
        raise AiError("job_timeout", "Video job exceeded the two-hour execution limit.")
    except AiError as error:
        if error.code in ("provider_unavailable", "provider_error", "job_timeout"):
            try:
                stopped = provider.cancel(prompt_id)
            except AiError:
                stopped = False
            if not stopped:
                raise AiError(
                    "remote_job_unconfirmed",
                    "ComfyUI connection failed; the remote job may continue.",
                ) from None
        raise
