"""Text tools restricted to a per-job host workspace; no arbitrary paths or shell."""

import base64
import json
import re
import uuid

from lmbox_geometry.contracts.ai import AiError

_NAME = re.compile(r"[\w][\w .-]{0,254}", re.UNICODE)
_MAX_FILE = 1024 * 1024
_MAX_TOTAL = 8 * _MAX_FILE


class Files:
    def __init__(self, workspace):
        self.workspace = workspace
        self.root = workspace / "files"
        self.root.mkdir(parents=True, exist_ok=True)
        if self.root.is_symlink():
            raise AiError("invalid_workspace", "Agent file directory cannot be a symbolic link.")
        self.written = set()

    def _path(self, name):
        if (
            not isinstance(name, str)
            or not _NAME.fullmatch(name)
            or name.rstrip(" .") != name
            or ".." in name
        ):
            raise AiError("invalid_tool_input", "Use a simple filename without a directory path.")
        path = self.root / name
        if path.is_symlink() or (path.exists() and not path.is_file()):
            raise AiError("invalid_tool_input", "Agent tools can access regular text files only.")
        return path

    def stage(self, attachments):
        if not isinstance(attachments, list) or len(attachments) > 16:
            raise AiError("invalid_request", "Agent accepts at most 16 text attachments.")
        names = set()
        total = 0
        for attachment in attachments:
            if not isinstance(attachment, dict):
                raise AiError("invalid_request", "Invalid text attachment.")
            name = attachment.get("name")
            if not isinstance(name, str) or name in names:
                raise AiError("invalid_request", "Attachment filenames must be unique.")
            names.add(name)
            content = attachment.get("content")
            if not isinstance(content, str):
                raise AiError("invalid_request", "Attachment content must be UTF-8 text.")
            total += len(content.encode("utf-8"))
            if total > _MAX_FILE:
                raise AiError("file_limit", "Text attachments must not exceed 1 MiB in total.")
            self.write(name, content)
        self.written.clear()

    def list(self):
        entries = [path for path in self.root.iterdir() if path.is_file() and not path.is_symlink()]
        if len(entries) > 64:
            raise AiError("file_limit", "Agent workspace exceeds the 64-file limit.")
        return sorted(path.name for path in entries)

    def read(self, name):
        path = self._path(name)
        try:
            with path.open("rb") as stream:
                content = stream.read(_MAX_FILE + 1)
            if len(content) > _MAX_FILE:
                raise AiError("file_limit", "Agent text files must not exceed 1 MiB.")
            return content.decode("utf-8")
        except (OSError, UnicodeError):
            raise AiError(
                "file_unavailable", "The requested UTF-8 text file is unavailable."
            ) from None

    def write(self, name, content):
        path = self._path(name)
        if not isinstance(content, str):
            raise AiError("invalid_tool_input", "File content must be UTF-8 text.")
        data = content.encode("utf-8")
        if len(data) > _MAX_FILE:
            raise AiError("file_limit", "Agent text files must not exceed 1 MiB.")
        names = self.list()
        if name not in names and len(names) >= 64:
            raise AiError("file_limit", "Agent workspace is limited to 64 files.")
        total = sum((self.root / item).stat().st_size for item in names if item != name)
        if total + len(data) > _MAX_TOTAL:
            raise AiError("file_limit", "Agent workspace exceeds the 8 MiB limit.")
        path.write_bytes(data)
        self.written.add(name)
        return {"name": name, "bytes": len(data)}

    def artifacts(self):
        directory = self.workspace / "artifacts"
        directory.mkdir(parents=True, exist_ok=True)
        if directory.is_symlink():
            raise AiError("invalid_workspace", "Artifact directory cannot be a symbolic link.")
        artifacts = []
        for name in sorted(self.written):
            artifact_id = uuid.uuid4().hex + ".txt"
            (directory / artifact_id).write_text(self.read(name), encoding="utf-8")
            artifacts.append({"id": artifact_id, "name": name, "mimeType": "text/plain"})
        (directory / "manifest.json").write_text(json.dumps(artifacts), encoding="utf-8")
        return artifacts


def read_artifact(workspace, artifact_id):
    if not isinstance(artifact_id, str) or not re.fullmatch(r"[a-f0-9]{32}\.txt", artifact_id):
        raise AiError("invalid_artifact", "Invalid agent artifact identifier.")
    directory = workspace / "artifacts"
    path, manifest = directory / artifact_id, directory / "manifest.json"
    if directory.is_symlink() or path.is_symlink() or manifest.is_symlink():
        raise AiError("invalid_artifact", "Symbolic-link artifacts are not allowed.")
    try:
        records = json.loads(manifest.read_text(encoding="utf-8"))
        record = next(item for item in records if item["id"] == artifact_id)
        with path.open("rb") as stream:
            content = stream.read(_MAX_FILE + 1)
        if len(content) > _MAX_FILE:
            raise AiError("file_limit", "Agent artifact exceeds the size limit.")
    except (OSError, ValueError, StopIteration, KeyError):
        raise AiError("artifact_missing", "The artifact is unavailable for this job.") from None
    return {
        "name": record["name"],
        "mimeType": record["mimeType"],
        "base64": base64.b64encode(content).decode("ascii"),
    }
