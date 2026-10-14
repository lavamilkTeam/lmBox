"""Save provider outputs under generated IDs in the host-owned job workspace."""

import base64
import json
import mimetypes
import re
import uuid

from lmbox_geometry.contracts.ai import AiError

from .comfy import MAX_ARTIFACT


def _output_name(filename):
    name = str(filename).replace("\\", "/").split("/")[-1]
    name = re.sub(r'[\x00-\x1f\x7f:*?"<>|]', "_", name).strip(" .")
    if not name:
        return "output.bin"
    stem, dot, extension = name.rpartition(".")
    suffix = dot + extension if dot and re.fullmatch(r"[A-Za-z0-9]{1,10}", extension) else ""
    stem = stem if suffix else name
    budget = 255 - len(suffix.encode("utf-8"))
    stem = stem.encode("utf-8")[:budget].decode("utf-8", errors="ignore").rstrip(" .")
    return (stem or "output") + suffix


def save_outputs(workspace, outputs, download):
    directory = workspace / "artifacts"
    directory.mkdir(parents=True, exist_ok=True)
    if directory.is_symlink():
        raise AiError("invalid_workspace", "Artifact directory cannot be a symbolic link.")
    artifacts, seen, total = [], set(), 0
    if not isinstance(outputs, dict):
        raise AiError("invalid_artifact", "ComfyUI returned invalid outputs.")
    for output in outputs.values():
        if not isinstance(output, dict):
            continue
        for group in ("videos", "gifs", "images", "audio", "files"):
            entries = output.get(group, [])
            if not isinstance(entries, list):
                continue
            for item in entries:
                if not isinstance(item, dict) or "filename" not in item:
                    continue
                if item.get("type", "output") != "output":
                    continue
                identity = (item["filename"], item.get("subfolder", ""))
                if identity in seen:
                    continue
                seen.add(identity)
                if len(artifacts) >= 32:
                    raise AiError("artifact_limit", "A workflow may return at most 32 artifacts.")
                name = _output_name(item["filename"])
                suffix = "." + name.rsplit(".", 1)[-1] if "." in name else ""
                if not re.fullmatch(r"\.[A-Za-z0-9]{1,10}", suffix):
                    suffix = ""
                artifact_id = uuid.uuid4().hex + suffix
                content = download(item)
                if len(content) > MAX_ARTIFACT:
                    raise AiError("artifact_limit", "Artifact exceeds the 32 MiB limit.")
                total += len(content)
                if total > 128 * 1024 * 1024:
                    raise AiError("artifact_limit", "Job artifacts exceed the 128 MiB total limit.")
                (directory / artifact_id).write_bytes(content)
                artifacts.append(
                    {
                        "id": artifact_id,
                        "name": name or artifact_id,
                        "mimeType": mimetypes.guess_type(name)[0] or "application/octet-stream",
                    }
                )
    if not artifacts:
        raise AiError("no_artifacts", "Workflow completed without downloadable output files.")
    (directory / "manifest.json").write_text(json.dumps(artifacts), encoding="utf-8")
    return artifacts


def read_artifact(workspace, artifact_id):
    if not isinstance(artifact_id, str) or not re.fullmatch(
        r"[a-f0-9]{32}(\.[\w]{1,10})?", artifact_id
    ):
        raise AiError("invalid_artifact", "Invalid artifact identifier.")
    directory = workspace / "artifacts"
    manifest = directory / "manifest.json"
    path = directory / artifact_id
    if directory.is_symlink() or manifest.is_symlink() or path.is_symlink():
        raise AiError("invalid_artifact", "Symbolic-link artifacts are not allowed.")
    try:
        items = json.loads(manifest.read_text(encoding="utf-8"))
        item = next(item for item in items if item["id"] == artifact_id)
        with path.open("rb") as stream:
            content = stream.read(MAX_ARTIFACT + 1)
        if len(content) > MAX_ARTIFACT:
            raise AiError("artifact_limit", "Artifact exceeds the 32 MiB limit.")
    except (OSError, ValueError, StopIteration, KeyError):
        raise AiError("artifact_missing", "The artifact is unavailable for this job.") from None
    return {
        "name": item["name"],
        "mimeType": item["mimeType"],
        "base64": base64.b64encode(content).decode("ascii"),
    }
