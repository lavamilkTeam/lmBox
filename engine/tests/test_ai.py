"""Public AI facades against local protocol/provider fixtures, without cloud inference."""

import base64
import json
import os
import subprocess
import sys
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from lmbox_geometry.contracts.ai import AiError
from lmbox_geometry.modules import agent, video

METADATA = {
    "CloudVideo": {
        "display_name": "Cloud Video",
        "category": "API/video",
        "output": ["VIDEO"],
        "input": {
            "required": {
                "prompt": ["STRING", {"default": ""}],
                "duration": ["INT", {"default": 5, "min": 1, "max": 20}],
            }
        },
    },
    "SaveVideo": {
        "output_node": True,
        "output": [],
        "input": {"required": {"video": ["VIDEO"]}},
    },
    "VideoFilter": {
        "output": ["VIDEO"],
        "input": {"required": {"video": ["VIDEO"]}},
    },
}


def request(capability="video", operation="start", payload=None):
    return {
        "schemaVersion": 1,
        "projectId": "fixture-project",
        "requestId": "fixture-request",
        "inputRevision": 2,
        "capability": capability,
        "operation": operation,
        "payload": payload or {},
    }


def workflow():
    return {
        "nodes": [
            {
                "id": "1",
                "type": "CloudVideo",
                "x": 0,
                "y": 0,
                "inputs": {"prompt": "Protocol fixture", "duration": 5},
            },
            {
                "id": "2",
                "type": "SaveVideo",
                "x": 200,
                "y": 0,
                "inputs": {"video": {"nodeId": "1", "outputIndex": 0}},
            },
        ]
    }


@contextmanager
def service(routes):
    calls = []

    class Handler(BaseHTTPRequestHandler):
        def handle_request(self):
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length)
            body = json.loads(raw) if raw else None
            calls.append((self.command, self.path, body, dict(self.headers)))
            route = routes.get((self.command, self.path), (404, {"error": "fixture missing"}))
            status, result = route(body) if callable(route) else route
            if status == 0:
                self.close_connection = True
                self.connection.close()
                return
            content = result if isinstance(result, bytes) else json.dumps(result).encode()
            self.send_response(status)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)

        do_GET = handle_request
        do_POST = handle_request

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}", calls
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def video_routes():
    return {
        ("GET", "/object_info"): (200, METADATA),
        ("POST", "/prompt"): (200, {"prompt_id": "fixture-job", "node_errors": {}}),
        ("GET", "/history/fixture-job"): (
            200,
            {
                "fixture-job": {
                    "status": {"completed": True, "status_str": "success"},
                    "outputs": {"2": {"videos": [{"filename": "fixture.mp4", "type": "output"}]}},
                }
            },
        ),
        ("GET", "/view?filename=fixture.mp4&type=output&subfolder="): (200, b"fixture video"),
    }


def test_video_catalog_execution_and_registered_artifact(tmp_path, monkeypatch):
    with service(video_routes()) as (url, calls):
        monkeypatch.setenv("LMBOX_COMFYUI_URL", url)
        catalog = video.execute(request(operation="inspect"), tmp_path, threading.Event(), print)
        assert catalog["configured"]
        assert catalog["nodes"][0]["inputs"][1]["max"] == 20
        result = video.execute(
            request(payload={"workflow": workflow()}), tmp_path, threading.Event(), lambda _: None
        )
    prompt = next(body for method, path, body, _ in calls if path == "/prompt")["prompt"]
    assert prompt["2"]["inputs"]["video"] == ["1", 0]
    artifact = result["artifacts"][0]
    data = video.execute(
        request(operation="artifact", payload={"artifactId": artifact["id"]}),
        tmp_path,
        threading.Event(),
        lambda _: None,
    )
    assert base64.b64decode(data["base64"]) == b"fixture video"
    assert data["mimeType"] == "video/mp4"
    with pytest.raises(AiError, match="identifier"):
        video.execute(
            request(operation="artifact", payload={"artifactId": "../secret"}),
            tmp_path,
            threading.Event(),
            lambda _: None,
        )
    with pytest.raises(AiError, match="unavailable"):
        video.execute(
            request(operation="artifact", payload={"artifactId": "a" * 32}),
            tmp_path,
            threading.Event(),
            lambda _: None,
        )


@pytest.mark.parametrize("problem", ["dangling", "wrong_type", "range", "cycle"])
def test_invalid_graph_never_submits(problem, tmp_path, monkeypatch):
    graph = workflow()
    if problem == "dangling":
        graph["nodes"][1]["inputs"]["video"]["nodeId"] = "missing"
    elif problem == "wrong_type":
        graph["nodes"][0]["inputs"]["prompt"] = {"nodeId": "1", "outputIndex": 0}
    elif problem == "range":
        graph["nodes"][0]["inputs"]["duration"] = 0
    else:
        graph["nodes"][0].update(
            type="VideoFilter", inputs={"video": {"nodeId": "1", "outputIndex": 0}}
        )
    with service(video_routes()) as (url, calls):
        monkeypatch.setenv("LMBOX_COMFYUI_URL", url)
        with pytest.raises(AiError) as caught:
            video.execute(
                request(payload={"workflow": graph}), tmp_path, threading.Event(), lambda _: None
            )
        assert caught.value.code == "invalid_workflow"
        assert not any(path == "/prompt" for _, path, _, _ in calls)


@pytest.mark.parametrize(
    "modern,running,confirmed,expected",
    [
        (True, True, True, "cancelled"),
        (True, True, False, "cancellation_unconfirmed"),
        (False, False, True, "cancelled"),
        (False, True, False, "cancellation_unconfirmed"),
    ],
)
def test_cancellation_targets_only_own_job(
    modern, running, confirmed, expected, tmp_path, monkeypatch
):
    cancel = threading.Event()
    routes = video_routes()

    def submitted(_):
        cancel.set()
        return 200, {"prompt_id": "fixture-job"}

    routes[("POST", "/prompt")] = submitted
    routes[("GET", "/history/fixture-job")] = (200, {})
    queue = {
        "queue_pending": [] if running else [[0, "fixture-job"]],
        "queue_running": [[0, "fixture-job"]] if running else [],
    }
    routes[("GET", "/queue")] = lambda _: (200, dict(queue))

    def cancel_job(_):
        if confirmed:
            queue["queue_running"] = []
            queue["queue_pending"] = []
        return 200, {"cancelled": True}

    if modern:
        routes[("POST", "/api/jobs/fixture-job/cancel")] = cancel_job

    def remove(body):
        assert body == {"delete": ["fixture-job"]}
        queue["queue_pending"] = []
        return 200, {}

    routes[("POST", "/queue")] = remove
    with service(routes) as (url, calls):
        monkeypatch.setenv("LMBOX_COMFYUI_URL", url)
        with pytest.raises(AiError) as caught:
            video.execute(
                request(payload={"workflow": workflow()}), tmp_path, cancel, lambda _: None
            )
        assert caught.value.code == expected
        assert not any("interrupt" in path for _, path, _, _ in calls)


def test_cloud_credentials_are_host_only(tmp_path, monkeypatch):
    routes = video_routes()
    metadata = json.loads(json.dumps(METADATA))
    metadata["CloudVideo"]["input"]["required"]["api_key"] = ["STRING", {"default": "hidden"}]
    routes[("GET", "/object_info")] = (200, metadata)
    routes[("GET", "/system_stats")] = (200, {"system": {"argv": ["--disable-metadata"]}})
    monkeypatch.setenv("LMBOX_COMFY_PARTNER_API_KEY", "fixture-partner-key")
    monkeypatch.setenv(
        "LMBOX_COMFY_NODE_CREDENTIALS", json.dumps({"CloudVideo": {"api_key": "fixture-node-key"}})
    )
    with service(routes) as (url, calls):
        monkeypatch.setenv("LMBOX_COMFYUI_URL", url)
        catalog = video.execute(
            request(operation="inspect"), tmp_path, threading.Event(), lambda _: None
        )
        assert "hidden" not in json.dumps(catalog)
        video.execute(
            request(payload={"workflow": workflow()}), tmp_path, threading.Event(), lambda _: None
        )
        body = next(body for _, path, body, _ in calls if path == "/prompt")
        assert body["extra_data"]["api_key_comfy_org"] == "fixture-partner-key"
        assert body["prompt"]["1"]["inputs"]["api_key"] == "fixture-node-key"
        graph = workflow()
        graph["nodes"][0]["inputs"]["api_key"] = "frontend-secret"
        with pytest.raises(AiError, match="host"):
            video.execute(
                request(payload={"workflow": graph}), tmp_path, threading.Event(), lambda _: None
            )


def test_v3_partner_combo_metadata_defaults_and_validation(tmp_path, monkeypatch):
    metadata = json.loads(json.dumps(METADATA))
    metadata["CloudVideo"]["display_name"] = None
    metadata["CloudVideo"]["input"]["required"]["model"] = [
        "COMBO",
        {"options": ["fixture-model-a", "fixture-model-b"], "default": "fixture-model-b"},
    ]
    routes = video_routes()
    routes[("GET", "/object_info")] = (200, metadata)
    with service(routes) as (url, calls):
        monkeypatch.setenv("LMBOX_COMFYUI_URL", url)
        catalog = video.execute(
            request(operation="inspect"), tmp_path, threading.Event(), lambda _: None
        )
        definition = next(node for node in catalog["nodes"] if node["type"] == "CloudVideo")
        assert definition["title"] == "CloudVideo"
        field = next(item for item in definition["inputs"] if item["name"] == "model")
        assert field["type"] == "COMBO"
        assert field["choices"] == ["fixture-model-a", "fixture-model-b"]
        assert field["default"] == "fixture-model-b"
        graph = workflow()
        graph["nodes"][0]["inputs"]["model"] = field["default"]
        video.execute(
            request(payload={"workflow": graph}), tmp_path, threading.Event(), lambda _: None
        )
        assert (
            next(body for _, path, body, _ in calls if path == "/prompt")["prompt"]["1"]["inputs"][
                "model"
            ]
            == "fixture-model-b"
        )
        graph["nodes"][0]["inputs"]["model"] = "unavailable-model"
        with pytest.raises(AiError, match="available choice"):
            video.execute(
                request(payload={"workflow": graph}), tmp_path, threading.Event(), lambda _: None
            )
        assert sum(path == "/prompt" for _, path, _, _ in calls) == 1


def dynamic_save_metadata():
    metadata = json.loads(json.dumps(METADATA))
    encoding = [
        "COMFY_DYNAMICCOMBO_V3",
        {
            "options": [
                {"key": "auto", "inputs": {}},
                {
                    "key": "re-encode",
                    "inputs": {
                        "required": {
                            "crf": ["FLOAT", {"default": 18.0, "min": 0.0, "max": 51.0}],
                        }
                    },
                },
            ]
        },
    ]
    codec = [
        "COMFY_DYNAMICCOMBO_V3",
        {
            "options": [
                {"key": "auto", "inputs": {}},
                {"key": "h264", "inputs": {"optional": {"encoding": encoding}}},
            ]
        },
    ]
    metadata["SaveVideo"]["input"]["required"]["format"] = [
        "COMFY_DYNAMICCOMBO_V3",
        {
            "options": [
                {"key": key, "inputs": {"required": {"codec": codec}}}
                for key in ("auto", "mp4", "mkv", "webm")
            ]
        },
    ]
    return metadata


@pytest.mark.parametrize("format_name", ["auto", "mp4", "mkv", "webm"])
def test_v3_save_video_selected_nested_defaults(format_name, tmp_path, monkeypatch):
    routes = video_routes()
    routes[("GET", "/object_info")] = (200, dynamic_save_metadata())
    graph = workflow()
    graph["nodes"][1]["inputs"]["format"] = format_name
    with service(routes) as (url, calls):
        monkeypatch.setenv("LMBOX_COMFYUI_URL", url)
        catalog = video.execute(
            request(operation="inspect"), tmp_path, threading.Event(), lambda _: None
        )
        field = next(
            item
            for node in catalog["nodes"]
            if node["type"] == "SaveVideo"
            for item in node["inputs"]
            if item["name"] == "format"
        )
        assert field["type"] == "COMFY_DYNAMICCOMBO_V3"
        assert field["choices"] == ["auto", "mp4", "mkv", "webm"]
        video.execute(
            request(payload={"workflow": graph}), tmp_path, threading.Event(), lambda _: None
        )
    submitted = next(body for _, path, body, _ in calls if path == "/prompt")["prompt"]
    assert submitted["2"]["inputs"]["format"] == format_name
    assert submitted["2"]["inputs"]["format.codec"] == "auto"
    assert "format.codec.encoding" not in submitted["2"]["inputs"]


def test_v3_imported_nested_settings_validate_selected_branch(tmp_path, monkeypatch):
    routes = video_routes()
    metadata = dynamic_save_metadata()
    routes[("GET", "/object_info")] = (200, metadata)
    graph = workflow()
    inputs = graph["nodes"][1]["inputs"]
    inputs.update(
        {
            "format": "mp4",
            "format.codec": "h264",
            "format.codec.encoding": "re-encode",
            "format.codec.encoding.crf": 12.0,
        }
    )
    with service(routes) as (url, calls):
        monkeypatch.setenv("LMBOX_COMFYUI_URL", url)
        video.execute(
            request(payload={"workflow": graph}), tmp_path, threading.Event(), lambda _: None
        )
        body = next(body for _, path, body, _ in calls if path == "/prompt")
        assert body["prompt"]["2"]["inputs"]["format.codec.encoding.crf"] == 12.0
        inputs["format.codec"] = "auto"
        with pytest.raises(AiError, match="unknown inputs"):
            video.execute(
                request(payload={"workflow": graph}), tmp_path, threading.Event(), lambda _: None
            )
        inputs["format.codec"] = "h264"
        inputs["format.codec.encoding.crf"] = 80.0
        with pytest.raises(AiError, match="allowed range"):
            video.execute(
                request(payload={"workflow": graph}), tmp_path, threading.Event(), lambda _: None
            )
        assert sum(path == "/prompt" for _, path, _, _ in calls) == 1


def test_v3_missing_nested_connection_is_not_invented(tmp_path, monkeypatch):
    metadata = dynamic_save_metadata()
    metadata["SaveVideo"]["input"]["required"]["format"][1]["options"][0]["inputs"]["required"][
        "reference"
    ] = ["VIDEO"]
    routes = video_routes()
    routes[("GET", "/object_info")] = (200, metadata)
    graph = workflow()
    graph["nodes"][1]["inputs"]["format"] = "auto"
    with service(routes) as (url, calls):
        monkeypatch.setenv("LMBOX_COMFYUI_URL", url)
        with pytest.raises(AiError, match="missing required"):
            video.execute(
                request(payload={"workflow": graph}), tmp_path, threading.Event(), lambda _: None
            )
        assert not any(path == "/prompt" for _, path, _, _ in calls)


def test_custom_credentials_require_disabled_output_metadata(tmp_path, monkeypatch):
    monkeypatch.setenv(
        "LMBOX_COMFY_NODE_CREDENTIALS",
        json.dumps(
            {
                "CloudVideo": {"api_key": "fixture-key"},
            }
        ),
    )
    routes = video_routes()
    routes[("GET", "/system_stats")] = (200, {"system": {"argv": []}})
    with service(routes) as (url, calls):
        monkeypatch.setenv("LMBOX_COMFYUI_URL", url)
        with pytest.raises(AiError) as caught:
            video.execute(
                request(payload={"workflow": workflow()}),
                tmp_path,
                threading.Event(),
                lambda _: None,
            )
        assert caught.value.code == "unsafe_credential_metadata"
        assert "--disable-metadata" in str(caught.value)
        assert "fixture-key" not in str(caught.value)
        assert not any(path == "/prompt" for _, path, _, _ in calls)


def test_lost_submit_response_is_uncertain_without_retry(tmp_path, monkeypatch):
    routes = video_routes()
    routes[("POST", "/prompt")] = (0, b"")
    with service(routes) as (url, calls):
        monkeypatch.setenv("LMBOX_COMFYUI_URL", url)
        with pytest.raises(AiError) as caught:
            video.execute(
                request(payload={"workflow": workflow()}),
                tmp_path,
                threading.Event(),
                lambda _: None,
            )
        assert caught.value.code == "submission_unconfirmed"
        assert "queue" in str(caught.value)
        assert sum(path == "/prompt" for _, path, _, _ in calls) == 1


@pytest.mark.parametrize("filename", ["clip:take1?.mp4", "视频" * 200 + ".mp4"])
def test_video_artifact_names_are_portable_and_byte_bounded(filename, tmp_path, monkeypatch):
    routes = video_routes()
    routes[("GET", "/history/fixture-job")][1]["fixture-job"]["outputs"]["2"]["videos"][0][
        "filename"
    ] = filename
    from urllib.parse import urlencode

    routes[
        ("GET", "/view?" + urlencode({"filename": filename, "type": "output", "subfolder": ""}))
    ] = (200, b"fixture video")
    with service(routes) as (url, _):
        monkeypatch.setenv("LMBOX_COMFYUI_URL", url)
        result = video.execute(
            request(payload={"workflow": workflow()}), tmp_path, threading.Event(), lambda _: None
        )
    item = result["artifacts"][0]
    assert len(item["name"].encode("utf-8")) <= 255
    assert not any(character in item["name"] for character in ':*?"<>|')
    assert item["name"].endswith(".mp4")
    assert item["mimeType"] == "video/mp4"


def test_provider_error_does_not_echo_response_body(tmp_path, monkeypatch):
    with service({("GET", "/object_info"): (401, {"token": "do-not-echo"})}) as (url, _):
        monkeypatch.setenv("LMBOX_COMFYUI_URL", url)
        with pytest.raises(AiError) as caught:
            video.execute(request(operation="inspect"), tmp_path, threading.Event(), lambda _: None)
        assert caught.value.code == "provider_auth"
        assert "do-not-echo" not in str(caught.value)


def require_agent():
    if sys.version_info < (3, 10):
        pytest.skip("LangGraph requires Python 3.10+")
    pytest.importorskip("langgraph.graph")


def tool(name, args, call_id="call-1"):
    return {
        "id": call_id,
        "type": "function",
        "function": {"name": name, "arguments": json.dumps(args)},
    }


def completion(content=None, calls=None):
    message = {"role": "assistant", "content": content}
    if calls:
        message["tool_calls"] = calls
    return {"choices": [{"message": message, "finish_reason": "tool_calls" if calls else "stop"}]}


def agent_routes(complete):
    return {
        ("GET", "/v1/models"): (200, {"data": [{"id": "fixture-model"}]}),
        ("POST", "/v1/chat/completions"): complete,
    }


def configure_agent(monkeypatch, url):
    monkeypatch.setenv("LMBOX_AGENT_BASE_URL", url + "/v1")
    monkeypatch.setenv("LMBOX_AGENT_MODEL", "fixture-model")
    monkeypatch.delenv("LMBOX_AGENT_API_KEY", raising=False)


def test_agent_tools_and_text_artifacts(tmp_path, monkeypatch):
    require_agent()
    responses = [
        completion(calls=[tool("read_file", {"name": "input.txt"})]),
        completion(calls=[tool("calculate", {"expression": "(2 + 3) * 4"})]),
        completion(calls=[tool("write_file", {"name": "result.txt", "content": "20"})]),
        completion("Calculation complete."),
    ]

    def complete(body):
        assert {item["function"]["name"] for item in body["tools"]} == {
            "calculate",
            "list_files",
            "read_file",
            "write_file",
        }
        return 200, responses.pop(0)

    with service(agent_routes(complete)) as (url, calls):
        configure_agent(monkeypatch, url)
        inspected = agent.execute(
            request("agent", "inspect"), tmp_path, threading.Event(), lambda _: None
        )
        assert inspected["model"] == "fixture-model"
        result = agent.execute(
            request(
                "agent",
                payload={
                    "prompt": "Calculate and save",
                    "maxSteps": 6,
                    "files": [{"name": "input.txt", "content": "(2 + 3) * 4"}],
                },
            ),
            tmp_path,
            threading.Event(),
            lambda _: None,
        )
    artifact = result["artifacts"][0]
    assert result["text"] == "Calculation complete."
    assert (tmp_path / "artifacts" / artifact["id"]).read_text() == "20"
    bodies = [body for _, path, body, _ in calls if path.endswith("completions")]
    assert json.loads(bodies[2]["messages"][-1]["content"])["result"] == 20


@pytest.mark.parametrize(
    "name,args",
    [
        ("read_file", {"name": "../outside.txt"}),
        ("write_file", {"name": "/tmp/outside.txt", "content": "bad"}),
        ("calculate", {"expression": "__import__('os').system('bad')"}),
        ("calculate", {"expression": "2 ** 100000000"}),
        ("shell", {"command": "whoami"}),
    ],
)
def test_agent_rejects_unsafe_tools(name, args, tmp_path, monkeypatch):
    require_agent()
    responses = [completion(calls=[tool(name, args)]), completion("Tool unavailable.")]
    with service(agent_routes(lambda _: (200, responses.pop(0)))) as (url, calls):
        configure_agent(monkeypatch, url)
        agent.execute(
            request("agent", payload={"prompt": "Exercise fixture", "maxSteps": 3}),
            tmp_path,
            threading.Event(),
            lambda _: None,
        )
    final_request = [body for _, path, body, _ in calls if path.endswith("completions")][-1]
    tool_result = json.loads(final_request["messages"][-1]["content"])
    assert tool_result["ok"] is False
    assert tool_result["error"]["code"] == "invalid_tool_input"


def test_agent_step_limit_does_not_execute_final_tools(tmp_path, monkeypatch):
    require_agent()
    reply = completion(calls=[tool("write_file", {"name": "too-late.txt", "content": "bad"})])
    with service(agent_routes(lambda _: (200, reply))) as (url, _):
        configure_agent(monkeypatch, url)
        with pytest.raises(AiError) as caught:
            agent.execute(
                request("agent", payload={"prompt": "Fixture", "maxSteps": 1}),
                tmp_path,
                threading.Event(),
                lambda _: None,
            )
        assert caught.value.code == "step_limit"
        assert not (tmp_path / "files" / "too-late.txt").exists()


def test_agent_refuses_symlink_attachment(tmp_path, monkeypatch):
    require_agent()
    (tmp_path / "files").mkdir()
    outside = tmp_path / "outside.txt"
    outside.write_text("keep")
    (tmp_path / "files" / "input.txt").symlink_to(outside)
    configure_agent(monkeypatch, "http://127.0.0.1:9")
    with pytest.raises(AiError, match="regular"):
        agent.execute(
            request(
                "agent",
                payload={
                    "prompt": "Fixture",
                    "files": [{"name": "input.txt", "content": "overwrite"}],
                },
            ),
            tmp_path,
            threading.Event(),
            lambda _: None,
        )
    assert outside.read_text() == "keep"


def test_worker_rejects_invalid_version_with_single_jsonl(tmp_path):
    invalid = request(operation="inspect")
    invalid["schemaVersion"] = 99
    environment = {**os.environ, "PYTHONPATH": str(Path(__file__).parents[1] / "src")}
    run = subprocess.run(
        [sys.executable, "-m", "lmbox_geometry.ai_worker"],
        input=json.dumps({"request": invalid, "workspace": str(tmp_path)}) + "\n",
        text=True,
        capture_output=True,
        env=environment,
        timeout=10,
    )
    lines = run.stdout.splitlines()
    assert len(lines) == 1
    assert json.loads(lines[0])["code"] == "invalid_request"
    assert not run.stderr


def worker_job(tmp_path, value, cancel_on_progress=False):
    environment = {**os.environ, "PYTHONPATH": str(Path(__file__).parents[1] / "src")}
    process = subprocess.Popen(
        [sys.executable, "-m", "lmbox_geometry.ai_worker"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=environment,
    )
    timer = threading.Timer(15, process.kill)
    timer.start()
    try:
        process.stdin.write(json.dumps({"request": value, "workspace": str(tmp_path)}) + "\n")
        process.stdin.flush()
        messages = []
        for line in process.stdout:
            message = json.loads(line)
            messages.append(message)
            if cancel_on_progress and message["type"] == "progress":
                process.stdin.write('{"type":"cancel"}\n')
                process.stdin.flush()
                cancel_on_progress = False
            if message["type"] in ("result", "error"):
                break
        # Keep stdin open through process exit: the cancellation reader must not
        # hold a buffered-I/O lock at interpreter shutdown.
        assert process.wait(timeout=10) == 0
        assert not process.stderr.read()
        assert sum(item["type"] in ("result", "error") for item in messages) == 1
        assert not process.stdout.read()
        return messages
    finally:
        timer.cancel()
        if process.poll() is None:
            process.kill()
        process.communicate(timeout=10)


def test_worker_video_protocol_completes_with_open_stdin(tmp_path, monkeypatch):
    with service(video_routes()) as (url, _):
        monkeypatch.setenv("LMBOX_COMFYUI_URL", url)
        messages = worker_job(tmp_path, request(payload={"workflow": workflow()}))
    assert messages[-1]["type"] == "result"
    assert messages[-1]["data"]["artifacts"][0]["name"] == "fixture.mp4"


def test_worker_cancellation_protocol(tmp_path, monkeypatch):
    routes = video_routes()
    routes[("GET", "/history/fixture-job")] = (200, {})
    routes[("POST", "/api/jobs/fixture-job/cancel")] = (200, {"cancelled": True})
    routes[("GET", "/queue")] = (200, {"queue_running": [], "queue_pending": []})
    with service(routes) as (url, _):
        monkeypatch.setenv("LMBOX_COMFYUI_URL", url)
        messages = worker_job(tmp_path, request(payload={"workflow": workflow()}), True)
    assert messages[-1]["type"] == "error"
    assert messages[-1]["code"] == "cancelled"


def test_worker_agent_protocol_uses_real_graph(tmp_path, monkeypatch):
    require_agent()
    with service(agent_routes(lambda _: (200, completion("Fixture response.")))) as (url, _):
        configure_agent(monkeypatch, url)
        messages = worker_job(
            tmp_path,
            request(
                "agent",
                payload={
                    "prompt": "Fixture prompt",
                    "maxSteps": 2,
                    "files": [],
                },
            ),
        )
    assert messages[-1] == {
        "type": "result",
        "data": {
            "text": "Fixture response.",
            "artifacts": [],
        },
    }
