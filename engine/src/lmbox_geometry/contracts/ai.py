"""Library-neutral AI failures and JSON request validation."""

import json

from jsonschema import Draft202012Validator, ValidationError

from . import SCHEMAS


class AiError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


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
