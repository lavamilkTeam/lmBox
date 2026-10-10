"""Compatible Chat Completions transport with bounded responses and safe errors."""

import json
import os
import urllib.error
import urllib.parse
import urllib.request

from lmbox_geometry.contracts.ai import AiError


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class ChatProvider:
    def __init__(self):
        self.base = os.environ.get("LMBOX_AGENT_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        self.model = os.environ.get("LMBOX_AGENT_MODEL", "")
        self.key = os.environ.get("LMBOX_AGENT_API_KEY", "")
        parsed = urllib.parse.urlsplit(self.base)
        if (
            parsed.scheme not in ("http", "https")
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
        ):
            raise AiError("invalid_configuration", "Invalid agent provider URL.")
        if not self.model:
            raise AiError(
                "model_not_configured", "Configure an agent model in the host environment."
            )
        if parsed.hostname == "api.openai.com" and not self.key:
            raise AiError(
                "missing_credentials", "The configured agent provider requires an API key."
            )
        self.opener = urllib.request.build_opener(_NoRedirect)

    def request(self, path, body=None):
        headers = {"Accept": "application/json"}
        if self.key:
            headers["Authorization"] = "Bearer " + self.key
        data = None
        if body is not None:
            data = json.dumps(body, allow_nan=False).encode()
            if len(data) > 2 * 1024 * 1024:
                raise AiError("context_limit", "Agent context exceeds the 2 MiB limit.")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self.base + path, data=data, headers=headers)
        try:
            with self.opener.open(request, timeout=30) as response:
                raw = response.read(2 * 1024 * 1024 + 1)
            if len(raw) > 2 * 1024 * 1024:
                raise AiError("provider_limit", "Agent provider response exceeds the size limit.")
            result = json.loads(raw)
            if not isinstance(result, dict):
                raise ValueError()
            return result
        except urllib.error.HTTPError as error:
            if error.code in (401, 403):
                raise AiError(
                    "provider_auth", "Agent provider rejected the configured credentials."
                )
            if error.code == 429:
                raise AiError("provider_rate_limit", "Agent provider rate or quota limit reached.")
            raise AiError("provider_error", f"Agent provider returned HTTP {error.code}.") from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise AiError("provider_unavailable", "Cannot reach the configured agent provider.")
        except (ValueError, UnicodeError):
            raise AiError("provider_error", "Agent provider returned invalid JSON.") from None

    def inspect(self):
        models = self.request("/models").get("data")
        if not isinstance(models, list) or not any(
            isinstance(model, dict) and model.get("id") == self.model for model in models
        ):
            raise AiError("model_unavailable", "The configured agent model is not available.")

    def complete(self, messages, tools):
        response = self.request(
            "/chat/completions",
            {
                "model": self.model,
                "messages": messages,
                "tools": tools,
                "tool_choice": "auto",
                "stream": False,
            },
        )
        try:
            choice = response["choices"][0]
            message = choice["message"]
            if choice.get("finish_reason") in ("length", "content_filter"):
                raise AiError(
                    "incomplete_response", "Agent provider did not complete its response."
                )
            if not isinstance(message, dict) or message.get("refusal"):
                raise AiError("provider_refusal", "Agent provider declined the request.")
            content = message.get("content")
            calls = message.get("tool_calls", [])
            if (content is not None and not isinstance(content, str)) or not isinstance(
                calls, list
            ):
                raise ValueError()
            if len(calls) > 8:
                raise AiError("tool_limit", "A model step may request at most eight tool calls.")
            if not calls and not content:
                raise ValueError()
            normalized, identifiers = [], set()
            for call in calls:
                identifier, function = call["id"], call["function"]
                if (
                    not isinstance(identifier, str)
                    or not 1 <= len(identifier) <= 128
                    or identifier in identifiers
                    or call.get("type") != "function"
                    or not isinstance(function.get("name"), str)
                    or not isinstance(function.get("arguments"), str)
                ):
                    raise ValueError()
                identifiers.add(identifier)
                normalized.append(
                    {
                        "id": identifier,
                        "type": "function",
                        "function": {
                            "name": function["name"],
                            "arguments": function["arguments"],
                        },
                    }
                )
            answer = {"role": "assistant", "content": content}
            if normalized:
                answer["tool_calls"] = normalized
            return answer
        except (ValueError, KeyError, IndexError, TypeError, AttributeError):
            raise AiError(
                "provider_error", "Agent provider returned an invalid completion."
            ) from None
