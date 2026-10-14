"""Library-neutral AI failures and JSON request validation."""

import json

from jsonschema import Draft202012Validator, ValidationError

from . import SCHEMAS


class AiError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def validate_ai_context(context):
    """Validate host-owned text history without accepting system or tool roles."""
    if context is None:
        return []
    if not isinstance(context, list) or len(context) > 40 or len(context) % 2:
        raise AiError("invalid_context", "Agent history must contain at most 20 complete turns.")
    messages, size = [], 0
    for index, message in enumerate(context):
        role = "user" if index % 2 == 0 else "assistant"
        if (
            not isinstance(message, dict)
            or set(message) != {"role", "content"}
            or message.get("role") != role
            or not isinstance(message.get("content"), str)
        ):
            raise AiError(
                "invalid_context", "Agent history requires alternating user/assistant text."
            )
        try:
            size += len(message["content"].encode("utf-8"))
        except UnicodeError:
            raise AiError(
                "invalid_context", "Agent history must contain valid UTF-8 text."
            ) from None
        if size > 128 * 1024:
            raise AiError("invalid_context", "Agent history exceeds the 128 KiB text limit.")
        messages.append({"role": role, "content": message["content"]})
    return messages


def validate_ai_request(request):
    try:
        schema = json.loads((SCHEMAS / "v1" / "ai-request.schema.json").read_text())
        Draft202012Validator(schema).validate(request)
        encoded = json.dumps(
            request, allow_nan=False, ensure_ascii=False, separators=(",", ":")
        ).encode("utf-8")
        if len(encoded) > 4 * 1024 * 1024:
            raise AiError("invalid_request", "AI request exceeds the 4 MiB limit.")
    except (ValidationError, ValueError, TypeError):
        raise AiError("invalid_request", "AI request does not match the shared schema.") from None
    if request["operation"] not in ("inspect", "start", "artifact"):
        raise AiError("invalid_request", "This operation belongs to the Rust task registry.")
    return request
