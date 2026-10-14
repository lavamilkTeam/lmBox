use crate::contracts::cfd::{CfdOperation, CfdRequest};
use crate::modules::cfd::CfdBackend;
use serde_json::json;
use std::fs;
use std::process::Command;

fn request(project: &str, id: &str, revision: u64, operation: CfdOperation) -> CfdRequest {
    CfdRequest {
        schema_version: 1,
        project_id: project.into(),
        request_id: id.into(),
        expected_revision: revision,
        operation,
        payload: Default::default(),
    }
}

fn backend() -> (tempfile::TempDir, CfdBackend) {
    let directory = tempfile::tempdir().unwrap();
    let python = Command::new(if cfg!(windows) { "python" } else { "python3" })
        .args(["-c", "import sys;print(sys.executable)"])
        .output()
        .expect("Python test interpreter");
    assert!(python.status.success());
    let engine = directory.path().join("engine");
    fs::create_dir_all(engine.join("lmbox_geometry")).unwrap();
    fs::write(engine.join("lmbox_geometry/__init__.py"), "").unwrap();
    fs::write(engine.join("lmbox_geometry/cfd_worker.py"), r#"
import sys,json,pathlib,time
session=pathlib.Path(sys.argv[sys.argv.index('--session')+1])
for line in sys.stdin:
 r=json.loads(line); op=r['operation']; state={'objects':[], 'dialogs':[{'id':'chooser','fileDialog':{'mode':'openFile'}}], 'lastAction':{'requestId':r['id']}}
 if op=='command' and r['payload']['commandId']=='exit': break
 if op=='command' and r['payload']['commandId']=='hang':
  pathlib.Path(__file__).with_name('pending').write_text('pending')
  time.sleep(60)
 if op=='dialogResponse':
  assert r['payload']['trustedHostSelection'] is True
  state['hostSelected']=r['payload']['path'] is not None
 if op=='importFile':
  p=pathlib.Path(r['payload']['path']); assert p.parent.parent==session/'imports'; assert p.name=='shape.step'; state['imported']=p.read_text()
 if op=='exportDocument':
  (session/'session.FCStd').write_bytes(b'document'); state['artifact']={'name':'session.FCStd','path':str(session/'session.FCStd')}
 if op=='command' and r['payload']['commandId']=='fail':
  print(json.dumps({'id':r['id'],'ok':False,'state':state,'error':{'code':'native_error','message':'native rejected'}}),flush=True)
 else: print(json.dumps({'id':r['id'],'ok':True,'state':state}),flush=True)
 if op=='close': break
"#).unwrap();
    let upstream = directory.path().join("source");
    fs::create_dir_all(upstream.join("CfdOF")).unwrap();
    let config = directory.path().join("runtime.json");
    fs::write(&config, serde_json::to_vec(&json!({"schemaVersion":1,"sourceCommit":"a90f60c2313ceba09c236c81f0693d93357d1614", "pythonExecutable":String::from_utf8(python.stdout).unwrap().trim(),"upstreamPath":upstream})).unwrap()).unwrap();
    let backend = CfdBackend::new(config, engine);
    (directory, backend)
}

#[test]
fn owns_revisions_and_preserves_correlated_errors() {
    let (_dir, backend) = backend();
    let initialized = backend.request(request("project", "start", 0, CfdOperation::Initialize));
    assert!(initialized.ok, "{:?}", initialized.error);
    assert_eq!(initialized.revision, 1);
    let inspected = backend.request(request("project", "poll", 0, CfdOperation::Poll));
    assert!(inspected.ok);
    assert_eq!(inspected.revision, 1);
    assert_eq!(
        inspected.state.as_ref().unwrap()["lastAction"]["requestId"],
        "poll"
    );
    let stale = backend.request(request("project", "stale", 0, CfdOperation::EditorAccept));
    assert_eq!(stale.error.unwrap().code, "stale_revision");
    assert_eq!(stale.request_id, "stale");
    let mut command = request("project", "native-fail", 1, CfdOperation::Command);
    command.payload.insert("commandId".into(), json!("fail"));
    let failed = backend.request(command);
    assert!(!failed.ok);
    assert_eq!(failed.revision, 1);
    assert_eq!(failed.error.unwrap().message, "native rejected");
    assert!(
        backend
            .request(request("project", "close", 1, CfdOperation::Close))
            .ok
    );
}

#[test]
fn stages_files_and_exports_only_bytes() {
    let (_dir, backend) = backend();
    assert!(
        backend
            .request(request("p", "start", 0, CfdOperation::Initialize))
            .ok
    );
    let mut import = request("p", "import", 1, CfdOperation::ImportFile);
    import.payload =
        serde_json::from_value(json!({"name":"shape.step","base64":"c2hhcGU="})).unwrap();
    let imported = backend.request(import);
    assert!(imported.ok, "{:?}", imported.error);
    assert_eq!(imported.state.as_ref().unwrap()["imported"], "shape");
    let exported = backend.request(request("p", "export", 2, CfdOperation::ExportDocument));
    assert!(exported.ok);
    assert_eq!(
        serde_json::to_value(exported.artifact).unwrap(),
        json!({"name":"session.FCStd", "base64":"ZG9jdW1lbnQ="})
    );
    let mut escape = request("p", "escape", 2, CfdOperation::ImportFile);
    escape.payload = serde_json::from_value(json!({"name":"../x.step","base64":""})).unwrap();
    assert_eq!(backend.request(escape).error.unwrap().code, "invalid_file");
}

#[test]
fn rejects_paths_unknown_versions_and_excess_sessions() {
    let (_dir, backend) = backend();
    let mut injected = request("p", "path", 0, CfdOperation::Initialize);
    injected
        .payload
        .insert("path".into(), json!("/tmp/private"));
    assert_eq!(
        backend.request(injected).error.unwrap().code,
        "invalid_payload"
    );
    let mut version = request("p", "version", 0, CfdOperation::Initialize);
    version.schema_version = 2;
    assert_eq!(
        backend.request(version).error.unwrap().code,
        "unsupported_version"
    );
    for project in ["p1", "p2"] {
        assert!(
            backend
                .request(request(project, "start", 0, CfdOperation::Initialize))
                .ok
        );
    }
    assert_eq!(
        backend
            .request(request("p3", "start", 0, CfdOperation::Initialize))
            .error
            .unwrap()
            .code,
        "session_limit"
    );
    assert!(
        backend
            .request(request("p1", "close", 1, CfdOperation::Close))
            .ok
    );
    assert!(
        backend
            .request(request("p3", "start", 0, CfdOperation::Initialize))
            .ok
    );
}

#[test]
fn missing_runtime_is_a_descriptive_failure() {
    let backend = CfdBackend::new("/nonexistent/lmbox-runtime.json", "/nonexistent/engine");
    let response = backend.request(request("p", "start", 0, CfdOperation::Initialize));
    assert!(!response.ok);
    assert_eq!(response.request_id, "start");
    assert_eq!(response.error.unwrap().code, "runtime_unavailable");
}

#[test]
fn dead_worker_is_not_reported_busy_or_silently_reinitialized() {
    let (_directory, backend) = backend();
    assert!(
        backend
            .request(request("p", "start", 0, CfdOperation::Initialize))
            .ok
    );
    let mut action = request("p", "exit", 1, CfdOperation::Command);
    action.payload.insert("commandId".into(), json!("exit"));
    let stopped = backend.request(action);
    assert_eq!(stopped.error.unwrap().code, "worker_stopped");
    assert_eq!(stopped.state.as_ref().unwrap()["busy"], false);
    assert_eq!(
        stopped.state.as_ref().unwrap()["pendingAction"],
        serde_json::Value::Null
    );
    assert_eq!(
        backend
            .request(request("p", "reconnect", 1, CfdOperation::Initialize))
            .error
            .unwrap()
            .code,
        "worker_stopped"
    );
    assert!(
        backend
            .request(request("p", "close", 1, CfdOperation::Close))
            .ok
    );
    assert!(
        backend
            .request(request("p", "restart", 0, CfdOperation::Initialize))
            .ok
    );
}

#[test]
fn shared_contract_fixture_and_error_envelope_match_schema() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap();
    let value: serde_json::Value = serde_json::from_slice(
        &fs::read(root.join("contracts/fixtures/v1/cfd-request.json")).unwrap(),
    )
    .unwrap();
    let request_schema: serde_json::Value = serde_json::from_slice(
        &fs::read(root.join("contracts/schemas/v1/cfd-request.schema.json")).unwrap(),
    )
    .unwrap();
    jsonschema::validator_for(&request_schema)
        .unwrap()
        .validate(&value)
        .unwrap();
    let request: CfdRequest = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(serde_json::to_value(&request).unwrap(), value);
    let backend = CfdBackend::new("/nonexistent/lmbox-runtime.json", "/nonexistent/engine");
    let response = serde_json::to_value(backend.request(request)).unwrap();
    assert!(response.get("state").is_none());
    assert!(response.get("artifact").is_none());
    let schema: serde_json::Value = serde_json::from_slice(
        &fs::read(root.join("contracts/schemas/v1/cfd-response.schema.json")).unwrap(),
    )
    .unwrap();
    jsonschema::validator_for(&schema)
        .unwrap()
        .validate(&response)
        .unwrap();
    let initialized: serde_json::Value = serde_json::from_slice(
        &fs::read(root.join("contracts/fixtures/v1/cfd-initialized-response.json")).unwrap(),
    )
    .unwrap();
    let validator = jsonschema::validator_for(&schema).unwrap();
    validator.validate(&initialized).unwrap();
    let mut invalid = initialized.clone();
    invalid["state"]["document"]["objects"] = json!("invalid");
    assert!(!validator.is_valid(&invalid));
    invalid = initialized;
    invalid["state"] = json!({});
    assert!(!validator.is_valid(&invalid));
}

#[test]
fn accepts_bounded_imports_and_optional_selection_append() {
    let backend = CfdBackend::new("/nonexistent/runtime.json", "/nonexistent/engine");
    let mut import = request("p", "import", 0, CfdOperation::ImportFile);
    import.payload =
        serde_json::from_value(json!({"name":"shape.stl","base64":"A".repeat(32 * 1024 * 1024)}))
            .unwrap();
    assert_eq!(
        backend.request(import.clone()).error.unwrap().code,
        "session_missing"
    );
    import
        .payload
        .insert("base64".into(), json!("A".repeat(32 * 1024 * 1024 + 4)));
    assert_eq!(
        backend.request(import).error.unwrap().code,
        "import_too_large"
    );
    for operation in [CfdOperation::SelectObject, CfdOperation::SelectGeometry] {
        let mut selection = request("p", "select", 0, operation);
        selection.payload =
            serde_json::from_value(json!({"objectId":"Object","append":true})).unwrap();
        if operation == CfdOperation::SelectGeometry {
            selection
                .payload
                .insert("subelements".into(), json!(["Face1"]));
        }
        assert_eq!(
            backend.request(selection.clone()).error.unwrap().code,
            "session_missing"
        );
        selection.payload.insert("append".into(), json!("invalid"));
        assert_eq!(
            backend.request(selection).error.unwrap().code,
            "invalid_payload"
        );
    }
}

#[test]
fn transport_cannot_claim_trusted_file_selection() {
    let (directory, backend) = backend();
    assert!(
        backend
            .request(request("p", "start", 0, CfdOperation::Initialize))
            .ok
    );
    let mut selection = request("p", "choice", 1, CfdOperation::DialogResponse);
    selection.payload = serde_json::from_value(
        json!({"dialogId":"native-dialog","path":"/tmp/anything","trustedHostSelection":true}),
    )
    .unwrap();
    let response = backend.request(selection);
    assert_eq!(response.error.unwrap().code, "invalid_payload");
    assert_eq!(response.revision, 1);
    let mut selection = request("p", "host-choice", 1, CfdOperation::DialogResponse);
    selection
        .payload
        .insert("dialogId".into(), json!("missing-dialog"));
    let response = backend.select_dialog_path(selection, None);
    assert_eq!(response.error.unwrap().code, "dialog_missing");
    let mut selection = request("p", "host-valid", 1, CfdOperation::DialogResponse);
    selection
        .payload
        .insert("dialogId".into(), json!("chooser"));
    let response = backend.select_dialog_path(
        selection,
        Some(directory.path().join("engine/lmbox_geometry/__init__.py")),
    );
    assert!(response.ok, "{:?}", response.error);
    assert_eq!(response.revision, 2);
    assert_eq!(response.state.unwrap()["hostSelected"], true);
}

#[test]
fn host_shutdown_interrupts_outstanding_worker_wait() {
    use std::sync::Arc;
    use std::time::{Duration, Instant};
    let (directory, backend) = backend();
    let backend = Arc::new(backend);
    assert!(
        backend
            .request(request("p", "start", 0, CfdOperation::Initialize))
            .ok
    );
    let task_backend = backend.clone();
    let task = std::thread::spawn(move || {
        let mut action = request("p", "hang", 1, CfdOperation::Command);
        action.payload.insert("commandId".into(), json!("hang"));
        task_backend.request(action)
    });
    let pending = directory.path().join("engine/lmbox_geometry/pending");
    let deadline = Instant::now() + Duration::from_secs(3);
    while !pending.is_file() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(10));
    }
    assert!(pending.is_file());
    let started = Instant::now();
    backend.close_all();
    assert!(started.elapsed() < Duration::from_secs(8));
    assert_eq!(task.join().unwrap().error.unwrap().code, "session_closed");
    assert_eq!(
        backend
            .request(request("new", "start", 0, CfdOperation::Initialize))
            .error
            .unwrap()
            .code,
        "backend_closed"
    );
}
