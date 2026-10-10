mod validation;
use super::runtime::{failure, RuntimeConfig, Worker, WorkerError, MAX_FRAME};
use crate::contracts::cfd::{CfdArtifact, CfdOperation, CfdRequest, CfdResponse};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use validation::{decode_base64, encode_base64, validate, worker_error};

type Sessions = HashMap<String, Arc<SessionHandle>>;

struct SessionHandle {
    state: Mutex<Session>,
    cancellation: Arc<AtomicBool>,
}

/// Owns isolated native CFD sessions. Hosts provide trusted runtime paths once.
pub struct CfdBackend {
    config_path: PathBuf,
    engine_source: PathBuf,
    sessions: Mutex<Sessions>,
    closing: AtomicBool,
}

struct Session {
    worker: Worker,
    revision: u64,
    state: Value,
    initialized: bool,
    closed: bool,
}

impl CfdBackend {
    pub fn new(runtime_config: impl Into<PathBuf>, engine_source: impl Into<PathBuf>) -> Self {
        Self {
            config_path: runtime_config.into(),
            engine_source: engine_source.into(),
            sessions: Mutex::new(HashMap::new()),
            closing: AtomicBool::new(false),
        }
    }

    pub fn request(&self, request: CfdRequest) -> CfdResponse {
        self.request_inner(request, None)
    }

    /// Applies a path obtained by the native host chooser, never by web IPC payload.
    pub fn select_dialog_path(&self, request: CfdRequest, path: Option<PathBuf>) -> CfdResponse {
        self.request_inner(request, Some(path))
    }

    fn request_inner(
        &self,
        request: CfdRequest,
        host_path: Option<Option<PathBuf>>,
    ) -> CfdResponse {
        let mut response = CfdResponse {
            schema_version: 1,
            project_id: request.project_id.clone(),
            request_id: request.request_id.clone(),
            input_revision: request.expected_revision,
            revision: 0,
            ok: false,
            state: None,
            error: None,
            artifact: None,
        };
        let validation = if host_path.is_some() {
            if request.operation != CfdOperation::DialogResponse
                || request.payload.len() != 1
                || !request.payload.contains_key("dialogId")
            {
                Err(failure("invalid_payload", "原生路径选择仅接受对话框标识。"))
            } else {
                let mut validated = request.clone();
                validated
                    .payload
                    .insert("buttonId".into(), json!("host-selection"));
                validate(&validated)
            }
        } else {
            validate(&request)
        };
        if let Err(error) = validation {
            response.error = Some(error);
            if let Some(session) = self
                .sessions
                .lock()
                .ok()
                .and_then(|sessions| sessions.get(&request.project_id).cloned())
            {
                if let Ok(session) = session.state.lock() {
                    response.revision = session.revision;
                    response.state = session.initialized.then(|| session.state.clone());
                }
            }
            return response;
        }
        let session = match self.session(&request) {
            Ok(session) => session,
            Err(error) => {
                response.error = Some(error);
                return response;
            }
        };
        let Ok(mut session) = session.state.lock() else {
            response.error = Some(failure("session_lock", "CFD 会话状态不可用。"));
            return response;
        };
        response.revision = session.revision;
        response.state = session.initialized.then(|| session.state.clone());
        let mutation = !request.operation.is_read_only()
            && !(request.operation == CfdOperation::Initialize && session.initialized);
        if mutation && request.expected_revision != session.revision {
            response.error = Some(failure(
                "stale_revision",
                "工程状态已更新，请读取最新状态后重试。",
            ));
            return response;
        }
        if session.closed {
            response.error = Some(failure("session_closed", "CFD 会话已关闭，请重新初始化。"));
            return response;
        }
        if request.operation == CfdOperation::Initialize && session.initialized {
            if !session.worker.is_running() {
                session.state["busy"] = json!(false);
                session.state["pendingAction"] = Value::Null;
                response.state = Some(session.state.clone());
                response.error = Some(failure(
                    "worker_stopped",
                    "CFD 工作进程已退出，未保存的原生文档无法恢复。请关闭会话后重新初始化。",
                ));
                return response;
            }
            response.ok = true;
            return response;
        }
        let result = self.dispatch(&mut session, &request, host_path);
        match result {
            Ok((native, artifact)) => {
                response.artifact = artifact;
                response.ok = native["ok"] == true;
                if native["state"]
                    .as_object()
                    .is_some_and(|state| !state.is_empty())
                {
                    session.state = native["state"].clone();
                }
                if mutation && response.ok {
                    session.revision += 1;
                }
                if request.operation == CfdOperation::Initialize && response.ok {
                    session.initialized = true;
                }
                if !response.ok {
                    response.error = Some(worker_error(native.get("error")));
                }
            }
            Err(error) => {
                // A timed-out ACK may already have changed the native document.
                if mutation && error.code == "worker_timeout" {
                    session.revision += 1;
                }
                if error.code == "worker_stopped" {
                    session.state["busy"] = json!(false);
                    session.state["pendingAction"] = Value::Null;
                    if request.operation == CfdOperation::Close {
                        session.revision += 1;
                        response.ok = true;
                    } else {
                        response.error = Some(error);
                    }
                } else {
                    response.error = Some(error);
                }
            }
        }
        session.state["revision"] = json!(session.revision);
        response.revision = session.revision;
        response.state = session.initialized.then(|| session.state.clone());
        if request.operation == CfdOperation::Close {
            session.closed = true;
            session.worker.shutdown();
            drop(session);
            if let Ok(mut sessions) = self.sessions.lock() {
                sessions.remove(&request.project_id);
            }
        }
        response
    }

    fn session(&self, request: &CfdRequest) -> Result<Arc<SessionHandle>, WorkerError> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| failure("session_lock", "CFD 会话列表不可用。"))?;
        if self.closing.load(Ordering::Acquire) {
            return Err(failure("backend_closed", "CFD 宿主已关闭。"));
        }
        if let Some(session) = sessions.get(&request.project_id) {
            return Ok(session.clone());
        }
        if request.operation != CfdOperation::Initialize {
            return Err(failure("session_missing", "请先初始化 CFD 工程会话。"));
        }
        if request.expected_revision != 0 {
            return Err(failure(
                "stale_revision",
                "新建 CFD 会话的输入版本必须为 0。",
            ));
        }
        if sessions.len() >= 2 {
            return Err(failure(
                "session_limit",
                "最多同时打开两个 CFD 会话，请先关闭一个。",
            ));
        }
        let config = RuntimeConfig::load(&self.config_path)?;
        let cancellation = Arc::new(AtomicBool::new(false));
        let worker = Worker::start(config, &self.engine_source, cancellation.clone())?;
        let session = Arc::new(SessionHandle {
            cancellation,
            state: Mutex::new(Session {
                worker,
                revision: 0,
                state: json!({}),
                initialized: false,
                closed: false,
            }),
        });
        sessions.insert(request.project_id.clone(), session.clone());
        Ok(session)
    }

    fn dispatch(
        &self,
        session: &mut Session,
        request: &CfdRequest,
        host_path: Option<Option<PathBuf>>,
    ) -> Result<(Value, Option<CfdArtifact>), WorkerError> {
        let operation = serde_json::to_value(request.operation).expect("operation enum");
        let payload = if let Some(path) = host_path {
            let identifier = &request.payload["dialogId"];
            let mode = session
                .state
                .get("dialogs")
                .and_then(Value::as_array)
                .and_then(|dialogs| {
                    dialogs
                        .iter()
                        .find(|dialog| dialog.get("id") == Some(identifier))
                })
                .and_then(|dialog| dialog.pointer("/fileDialog/mode"))
                .and_then(Value::as_str)
                .ok_or_else(|| {
                    failure(
                        "dialog_missing",
                        "原生文件对话框已关闭或发生变化，请重新选择。",
                    )
                })?;
            session.worker.validate_host_path(mode, path.as_deref())?;
            json!({"dialogId":identifier,"path":path,"trustedHostSelection":true})
        } else if request.operation == CfdOperation::ImportFile {
            let bytes = decode_base64(request.payload["base64"].as_str().unwrap())?;
            let path = session
                .worker
                .stage_import(request.payload["name"].as_str().unwrap(), &bytes)?;
            json!({"path":path})
        } else {
            Value::Object(request.payload.clone())
        };
        let mut native =
            session
                .worker
                .request(operation.as_str().unwrap(), payload, &request.request_id)?;
        let mut artifact = None;
        if let Some(state) = native.get_mut("state").and_then(Value::as_object_mut) {
            if state.remove("artifact").is_some() {
                let bytes = session.worker.export_document()?;
                let encoded = encode_base64(&bytes);
                if encoded.len() > validation::MAX_FILE_BASE64 {
                    return Err(failure(
                        "export_too_large",
                        "导出文档的 Base64 内容超过 32 MiB（文件 24 MiB）。",
                    ));
                }
                artifact = Some(CfdArtifact {
                    name: "session.FCStd".into(),
                    base64: encoded,
                });
            }
        }
        let artifact_size = artifact.as_ref().map_or(0, |value| value.base64.len());
        if serde_json::to_vec(&native)
            .map_or(true, |value| value.len() + artifact_size > MAX_FRAME - 1024)
        {
            return Err(failure("response_too_large", "CFD 响应超过 36 MiB。"));
        }
        Ok((native, artifact))
    }

    pub fn close_all(&self) {
        self.closing.store(true, Ordering::Release);
        let sessions = match self.sessions.lock() {
            Ok(mut sessions) => std::mem::take(&mut *sessions),
            Err(_) => return,
        };
        for session in sessions.values() {
            session.cancellation.store(true, Ordering::Release);
        }
        std::thread::scope(|scope| {
            for session in sessions.into_values() {
                scope.spawn(move || {
                    if let Ok(mut session) = session.state.lock() {
                        session.closed = true;
                        session.worker.shutdown();
                    }
                });
            }
        });
    }
}

impl Drop for CfdBackend {
    fn drop(&mut self) {
        self.close_all();
    }
}

#[cfg(test)]
mod tests;
