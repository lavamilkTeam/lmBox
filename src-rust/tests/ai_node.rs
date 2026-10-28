#![cfg(not(target_arch = "wasm32"))]
use lmbox::{
    contracts::ai::{AiJob, AiOperation, AiRequest, AiResponse, AiStatus},
    modules::ai::AiBackend,
};
use serde_json::{json, Value};
use std::{
    path::PathBuf,
    time::{Duration, Instant},
};

fn backend(root: &tempfile::TempDir) -> AiBackend {
    let fixture =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/ai-node/worker.mjs");
    AiBackend::new(
        "unused-python".into(),
        "unused-engine".into(),
        root.path().join("jobs"),
    )
    .with_agent_worker(
        std::env::var_os("LMBOX_TEST_NODE")
            .map(PathBuf::from)
            .unwrap_or_else(|| "node".into()),
        fixture,
    )
}
fn request(prompt: &str, files: Value) -> AiRequest {
    serde_json::from_value(
        json!({"schemaVersion": 1, "projectId": "node-fixture", "requestId":"first",
        "inputRevision": 7, "capability":"agent", "operation":"start",
        "payload":{"prompt":prompt,"maxSteps":32,"files":files}}),
    )
    .unwrap()
}
fn job(response: AiResponse) -> AiJob {
    assert!(response.ok, "{:?}", response.error);
    serde_json::from_value(response.data.unwrap()["job"].clone()).unwrap()
}
fn query(initial: &AiRequest, id: &str, operation: AiOperation) -> AiRequest {
    let mut request = initial.clone();
    request.operation = operation;
    request.payload.clear();
    request.job_id = Some(id.into());
    request
}
fn finish(backend: &AiBackend, request: &AiRequest, id: &str) -> AiJob {
    let started = Instant::now();
    loop {
        let current = job(backend.request(query(request, id, AiOperation::Status)));
        if current.status != AiStatus::Running {
            return current;
        }
        assert!(
            started.elapsed() < Duration::from_secs(15),
            "Node fixture timed out"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
}
fn execute(backend: &AiBackend, initial: &AiRequest) -> AiJob {
    let id = job(backend.request(initial.clone())).job_id;
    finish(backend, initial, &id)
}
#[test]
fn node_worker_uses_rust_identity_files_artifacts_and_trusted_history() {
    let root = tempfile::tempdir().unwrap();
    let backend = backend(&root);
    let mut inspect = request("[]", json!([]));
    inspect.operation = AiOperation::Inspect;
    inspect.payload.clear();
    let response = backend.request(inspect);
    assert!(response.ok, "{:?}", response.error);
    assert_eq!(response.data.unwrap()["model"], "node-protocol-fixture");
    let actions = json!([
        {"name":"list_files", "arguments":{}},
        {"name":"read_file", "arguments":{"name":"input.txt"}},
        {"name":"calculate", "arguments":{"expression":"(5 + 2) * 6"}},
        {"name":"write_file", "arguments":{"name":"answer.txt", "content":"42"}},
        {"name":"read_file", "arguments":{"name":"answer.txt"}}
    ]);
    let initial = request(
        &actions.to_string(),
        json!([{"name":"input.txt","content":"fixture input"}]),
    );
    let done = execute(&backend, &initial);
    assert_eq!(done.status, AiStatus::Succeeded, "{:?}", done.error);
    let result = done.result.unwrap();
    let text: Value = serde_json::from_str(result.text.as_ref().unwrap()).unwrap();
    assert_eq!(text["identity"]["result"]["projectId"], initial.project_id);
    assert_eq!(text["identity"]["result"]["inputRevision"], 7);
    assert_eq!(text["identity"]["result"]["capability"], "agent");
    assert_eq!(text["actions"][0]["result"], json!(["input.txt"]));
    assert_eq!(text["actions"][1]["result"], "fixture input");
    assert_eq!(text["actions"][2]["result"], 42.0);
    assert_eq!(text["actions"][4]["result"], "42");
    assert_eq!(result.artifacts.len(), 1);
    assert_eq!(result.artifacts[0].name, "answer.txt");
    let mut artifact = query(&initial, &done.job_id, AiOperation::Artifact);
    artifact
        .payload
        .insert("artifactId".into(), json!(result.artifacts[0].id));
    assert_eq!(backend.artifact_bytes(&artifact).unwrap().1, b"42");
    let mut next = request("[]", json!([]));
    next.request_id = "next".into();
    next.input_revision += 1;
    next.payload
        .insert("parentJobId".into(), json!(done.job_id));
    let continued = execute(&backend, &next);
    let text: Value =
        serde_json::from_str(continued.result.unwrap().text.as_ref().unwrap()).unwrap();
    assert_eq!(text["history"][0]["content"], actions.to_string());
    assert_eq!(text["history"][1]["content"], result.text.unwrap());
}
#[test]
fn host_tools_reject_paths_unknown_actions_invalid_args_and_nonfinite_arithmetic() {
    let root = tempfile::tempdir().unwrap();
    let backend = backend(&root);
    let actions = json!([
        {"name":"read_file", "arguments":{"name":"../outside"}},
        {"name":"write_file", "arguments":{"name":"/tmp/file", "content":"no"}},
        {"name":"exec", "arguments":{"command":"false"}},
        {"name":"workspace_info", "arguments":{"path":"outside"}},
        {"name":"calculate", "arguments":{"expression":"1 / 0"}},
        {"name":"calculate", "arguments":{"expression":"process.exit()"}},
        {"name":"calculate", "arguments":{"expression":"2 ** 2000"}},
        {"name":"calculate", "arguments":{"expression":"-2 ** 2 + 2 ** -2"}},
        {"name":"calculate", "arguments":{"expression":"(-5 // 2) + (-5 % 2)"}}
    ]);
    let done = execute(&backend, &request(&actions.to_string(), json!([])));
    assert_eq!(done.status, AiStatus::Succeeded, "{:?}", done.error);
    let text: Value = serde_json::from_str(done.result.unwrap().text.as_ref().unwrap()).unwrap();
    for i in 0..7 {
        assert_eq!(text["actions"][i]["ok"], false);
    }
    assert_eq!(text["actions"][7]["result"], -3.75);
    assert_eq!(text["actions"][8]["result"], -2.0);
}
#[test]
fn node_protocol_rejects_replayed_calls_and_worker_registered_artifacts() {
    for (mode, code) in [
        ("duplicate", "worker_protocol"),
        ("inject-artifact", "worker_protocol"),
    ]
    .into_iter()
    .chain(if cfg!(unix) {
        vec![("symlink-artifacts", "artifact_unavailable")]
    } else {
        vec![]
    }) {
        let root = tempfile::tempdir().unwrap();
        let backend = backend(&root);
        let done = execute(&backend, &request(mode, json!([])));
        assert_eq!(done.status, AiStatus::Failed);
        assert_eq!(done.error.unwrap().code, code, "{mode}");
    }
}
#[test]
fn node_cancellation_and_attachment_limits_remain_host_owned() {
    let root = tempfile::tempdir().unwrap();
    let backend = backend(&root);
    let initial = request("wait", json!([]));
    let id = job(backend.request(initial.clone())).job_id;
    let started = Instant::now();
    loop {
        if !job(backend.request(query(&initial, &id, AiOperation::Status)))
            .events
            .is_empty()
        {
            break;
        }
        assert!(started.elapsed() < Duration::from_secs(10));
        std::thread::sleep(Duration::from_millis(10));
    }
    backend.request(query(&initial, &id, AiOperation::Cancel));
    assert_eq!(finish(&backend, &initial, &id).status, AiStatus::Cancelled);
    let mut oversized = request(
        "[]",
        json!([{"name":"big.txt","content":"x".repeat(1024*1024+1)}]),
    );
    oversized.request_id = "oversized".into();
    let result = execute(&backend, &oversized);
    assert_eq!(result.status, AiStatus::Failed);
    assert_eq!(result.error.unwrap().code, "file_limit");
    let mut repeated = request(
        "[]",
        json!([{"name":"same.txt","content":"a"},{"name":"same.txt","content":"b"}]),
    );
    repeated.request_id = "repeated".into();
    assert_eq!(
        execute(&backend, &repeated).error.unwrap().code,
        "invalid_request"
    );
}

#[test]
fn inspect_cannot_invoke_agent_tools() {
    let root = tempfile::tempdir().unwrap();
    let backend = backend(&root);
    let mut initial = request("[]", json!([]));
    initial.operation = AiOperation::Inspect;
    initial.payload.clear();
    initial.project_id = "inspect-tool".into();
    let response = backend.request(initial);
    assert!(!response.ok);
    assert_eq!(response.error.unwrap().code, "worker_protocol");
}
