use super::runtime::{ContextMessage, ContextRole, Worker};
use crate::contracts::ai::{
    AiArtifact, AiCapability, AiError, AiEvent, AiJob, AiOperation, AiRequest, AiResponse,
    AiResult, AiStatus,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, VecDeque},
    io::Read,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Condvar, Mutex,
    },
};

const ARTIFACT_LIMIT: u64 = 32 * 1024 * 1024;
const REQUEST_LIMIT: usize = 4 * 1024 * 1024;
const RETAINED_JOBS: usize = 32;

struct Entry {
    project_id: String,
    start_request: AiRequest,
    context: Vec<ContextMessage>,
    job: AiJob,
    workspace: tempfile::TempDir,
    cancelled: Arc<AtomicBool>,
}

#[derive(Default)]
struct State {
    closed: bool,
    sequence: u64,
    jobs: VecDeque<Entry>,
    revisions: HashMap<(String, AiCapability), u64>,
    active: HashMap<String, Arc<AtomicBool>>,
}

#[derive(Default)]
struct Shared {
    state: Mutex<State>,
    idle: Condvar,
}

/// Hosts supply trusted runtime paths. Each accepted job owns an isolated workspace.
pub struct AiBackend {
    worker: Worker,
    agent_worker: Option<Worker>,
    root: PathBuf,
    shared: Arc<Shared>,
}

impl AiBackend {
    pub fn new(python: PathBuf, engine: PathBuf, root: PathBuf) -> Self {
        Self {
            worker: Worker::Source {
                python,
                engine: absolute(engine),
            },
            agent_worker: None,
            root: absolute(root),
            shared: Arc::default(),
        }
    }

    pub fn bundled(worker: PathBuf, root: PathBuf) -> Self {
        Self {
            worker: Worker::Bundled(absolute(worker)),
            agent_worker: None,
            root: absolute(root),
            shared: Arc::default(),
        }
    }

    /// Select a host-configured Node.js worker for Agent tasks only.
    pub fn with_agent_worker(mut self, node: PathBuf, entry: PathBuf) -> Self {
        self.agent_worker = Some(Worker::Node {
            node,
            entry: absolute(entry),
        });
        self
    }

    fn worker(&self, capability: AiCapability) -> &Worker {
        match (capability, &self.agent_worker) {
            (AiCapability::Agent, Some(worker)) => worker,
            _ => &self.worker,
        }
    }

    pub fn request(&self, request: AiRequest) -> AiResponse {
        let result = validate_request(&request).and_then(|()| match request.operation {
            AiOperation::Start => self.start(&request),
            AiOperation::Status | AiOperation::Cancel => self.status(&request),
            AiOperation::Inspect => self.inspect(&request),
            AiOperation::Artifact => self.artifact_bytes(&request).map(|(artifact, bytes)| json!({
                "name":artifact.name, "mimeType":artifact.mime_type, "base64":STANDARD.encode(bytes),
            })),
        });
        AiResponse::for_request(&request, result)
    }

    fn workspace(&self) -> Result<tempfile::TempDir, AiError> {
        std::fs::create_dir_all(&self.root)
            .map_err(|_| AiError::new("workspace_unavailable", "无法创建 AI 任务目录。"))?;
        tempfile::Builder::new()
            .prefix("ai-")
            .tempdir_in(&self.root)
            .map_err(|_| AiError::new("workspace_unavailable", "无法创建独立 AI 任务目录。"))
    }

    fn start(&self, request: &AiRequest) -> Result<Value, AiError> {
        let mut state = self.shared.state.lock().unwrap();
        if state.closed {
            return Err(closed());
        }
        if let Some(entry) = state.jobs.iter().find(|entry| {
            entry.project_id == request.project_id
                && entry.start_request.request_id == request.request_id
        }) {
            if entry.job.capability == request.capability
                && entry.job.input_revision == request.input_revision
                && entry.start_request.payload == request.payload
            {
                return Ok(json!({"job":entry.job}));
            }
            return Err(AiError::new(
                "request_conflict",
                "此请求标识已用于不同输入，请为新任务使用新的请求标识。",
            ));
        }
        let marker = self
            .root
            .join("requests")
            .join(&request.project_id)
            .join(&request.request_id);
        if marker.try_exists().map_err(|_| history_error())? {
            return Err(expired());
        }
        ensure_slot(&state)?;
        let key = (request.project_id.clone(), request.capability);
        if state
            .revisions
            .get(&key)
            .is_some_and(|revision| request.input_revision < *revision)
        {
            return Err(AiError::new(
                "stale_revision",
                "任务输入版本已过期，请使用当前输入重新运行。",
            ));
        }
        if state.jobs.iter().any(|entry| {
            entry.project_id == request.project_id
                && entry.job.capability == request.capability
                && entry.job.status == AiStatus::Running
        }) {
            return Err(AiError::new(
                "busy",
                "此工程的同类 AI 任务仍在运行，请先完成或取消它。",
            ));
        }
        let context = conversation_context(&state, request)?;
        while state.jobs.len() >= RETAINED_JOBS {
            let index = state
                .jobs
                .iter()
                .position(|entry| entry.job.status != AiStatus::Running)
                .ok_or_else(|| AiError::new("busy", "AI 任务数量已达上限。"))?;
            state.jobs.remove(index).expect("existing entry");
        }
        let workspace = self.workspace()?;
        self.record_request(&marker)?;
        let job_id = workspace
            .path()
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        let path = workspace.path().to_owned();
        let cancelled = Arc::new(AtomicBool::new(false));
        let job = AiJob {
            job_id: job_id.clone(),
            capability: request.capability,
            input_revision: request.input_revision,
            status: AiStatus::Running,
            events: Vec::new(),
            result: None,
            error: None,
        };
        state.active.insert(job_id.clone(), Arc::clone(&cancelled));
        state.revisions.insert(key, request.input_revision);
        state.jobs.push_back(Entry {
            project_id: request.project_id.clone(),
            start_request: request.clone(),
            context: context.clone(),
            job: job.clone(),
            workspace,
            cancelled: Arc::clone(&cancelled),
        });
        let shared = Arc::clone(&self.shared);
        let worker = self.worker(request.capability).clone();
        let request = request.clone();
        let task_id = job_id.clone();
        let spawn = std::thread::Builder::new()
            .name("lmbox-ai".into())
            .spawn(move || {
                let outcome = worker
                    .run(&request, &path, &context, &cancelled, |message| {
                        let mut state = shared.state.lock().unwrap();
                        if let Some(entry) = state
                            .jobs
                            .iter_mut()
                            .find(|entry| entry.job.job_id == task_id)
                        {
                            append_event(&mut entry.job, message);
                        }
                    })
                    .and_then(|data| validate_result(data, &path));
                let mut state = shared.state.lock().unwrap();
                if let Some(entry) = state
                    .jobs
                    .iter_mut()
                    .find(|entry| entry.job.job_id == task_id)
                {
                    match outcome {
                        Ok(result) => {
                            entry.job.result = Some(result);
                            entry.job.status = AiStatus::Succeeded;
                        }
                        Err(error) => {
                            entry.job.status = if error.code == "cancelled" {
                                AiStatus::Cancelled
                            } else {
                                AiStatus::Failed
                            };
                            entry.job.error = Some(error);
                        }
                    }
                }
                state.active.remove(&task_id);
                shared.idle.notify_all();
            });
        if spawn.is_err() {
            state.active.remove(&job_id);
            state.jobs.retain(|entry| entry.job.job_id != job_id);
            return Err(AiError::new(
                "runtime_unavailable",
                "无法启动 AI 任务线程。",
            ));
        }
        Ok(json!({"job":job}))
    }

    fn status(&self, request: &AiRequest) -> Result<Value, AiError> {
        let mut state = self.shared.state.lock().unwrap();
        if state.closed {
            return Err(closed());
        }
        let entry = matching_job(&mut state, request)?;
        if request.operation == AiOperation::Cancel
            && entry.job.status == AiStatus::Running
            && !entry.cancelled.swap(true, Ordering::AcqRel)
        {
            append_event(&mut entry.job, "正在取消任务。".into());
        }
        Ok(json!({"job":entry.job}))
    }

    fn inspect(&self, request: &AiRequest) -> Result<Value, AiError> {
        let workspace;
        let token;
        let cancelled = Arc::new(AtomicBool::new(false));
        {
            let mut state = self.shared.state.lock().unwrap();
            ensure_slot(&state)?;
            workspace = self.workspace()?;
            state.sequence += 1;
            token = format!("inspect-{}", state.sequence);
            state.active.insert(token.clone(), Arc::clone(&cancelled));
        }
        let outcome = self
            .worker(request.capability)
            .run(request, workspace.path(), &[], &cancelled, |_| {})
            .and_then(|value| {
                let valid = value["configured"].is_boolean()
                    && match request.capability {
                        AiCapability::Video => value["nodes"]
                            .as_array()
                            .is_some_and(|nodes| nodes.len() <= 10_000),
                        AiCapability::Agent => {
                            value["model"].is_string()
                                && value["tools"]
                                    .as_array()
                                    .is_some_and(|tools| tools.iter().all(Value::is_string))
                        }
                    };
                if valid {
                    Ok(value)
                } else {
                    Err(AiError::new(
                        "worker_protocol",
                        "AI 能力检查返回了无效响应。",
                    ))
                }
            });
        drop(workspace);
        let mut state = self.shared.state.lock().unwrap();
        state.active.remove(&token);
        self.shared.idle.notify_all();
        outcome
    }

    /// Native save seam: only a successful, identity-matched job can provide bytes.
    pub fn artifact_bytes(&self, request: &AiRequest) -> Result<(AiArtifact, Vec<u8>), AiError> {
        validate_request(request)?;
        if request.operation != AiOperation::Artifact {
            return Err(invalid());
        }
        let mut state = self.shared.state.lock().unwrap();
        if state.closed {
            return Err(closed());
        }
        let entry = matching_job(&mut state, request)?;
        if entry.job.status != AiStatus::Succeeded {
            return Err(AiError::new("artifact_unavailable", "任务尚无可读取产物。"));
        }
        let id = request.payload["artifactId"].as_str().ok_or_else(invalid)?;
        let artifact = entry
            .job
            .result
            .as_ref()
            .and_then(|result| result.artifacts.iter().find(|artifact| artifact.id == id))
            .ok_or_else(|| AiError::new("artifact_not_found", "此任务不存在该产物。"))?
            .clone();
        let path = artifact_path(entry.workspace.path(), &artifact)?;
        let mut bytes = Vec::new();
        std::fs::File::open(path)
            .and_then(|file| file.take(ARTIFACT_LIMIT + 1).read_to_end(&mut bytes))
            .map_err(|_| AiError::new("artifact_unavailable", "无法读取任务产物。"))?;
        if (bytes.is_empty() && artifact.mime_type != "text/plain")
            || bytes.len() as u64 > ARTIFACT_LIMIT
        {
            return Err(AiError::new("artifact_size", "产物为空或超过 32 MiB。"));
        }
        Ok((artifact, bytes))
    }

    /// Ends this backend permanently, waits for child reaping, then removes workspaces.
    pub fn close_all(&self) {
        let mut state = self.shared.state.lock().unwrap();
        state.closed = true;
        for cancelled in state.active.values() {
            cancelled.store(true, Ordering::Release);
        }
        while !state.active.is_empty() {
            state = self.shared.idle.wait(state).unwrap();
        }
        state.jobs.clear();
        state.revisions.clear();
    }

    fn record_request(&self, marker: &Path) -> Result<(), AiError> {
        let history = self.root.join("requests");
        std::fs::create_dir_all(&history).map_err(|_| history_error())?;
        let mut count = 0;
        for project in std::fs::read_dir(&history).map_err(|_| history_error())? {
            let project = project.map_err(|_| history_error())?;
            if !project.file_type().map_err(|_| history_error())?.is_dir() {
                return Err(history_error());
            }
            for entry in std::fs::read_dir(project.path()).map_err(|_| history_error())? {
                entry.map_err(|_| history_error())?;
                count += 1;
                if count >= 4096 {
                    return Err(AiError::new(
                        "history_full",
                        "AI 请求记录已达上限；为避免重复执行，无法接受新任务。",
                    ));
                }
            }
        }
        std::fs::create_dir_all(marker.parent().expect("marker has project parent"))
            .map_err(|_| history_error())?;
        let file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(marker)
            .map_err(|error| {
                if error.kind() == std::io::ErrorKind::AlreadyExists {
                    expired()
                } else {
                    history_error()
                }
            })?;
        // The durable marker contains no prompt, attachments, provider key or model data.
        file.sync_all().map_err(|_| history_error())
    }
}

impl Drop for AiBackend {
    fn drop(&mut self) {
        self.close_all();
    }
}

fn absolute(path: PathBuf) -> PathBuf {
    if path.is_absolute() {
        path
    } else {
        std::env::current_dir().unwrap_or_default().join(path)
    }
}

fn ensure_slot(state: &State) -> Result<(), AiError> {
    if state.closed {
        Err(closed())
    } else if state.active.len() >= 2 {
        Err(AiError::new(
            "busy",
            "同时最多运行两个 AI 任务，请稍后重试。",
        ))
    } else {
        Ok(())
    }
}

fn closed() -> AiError {
    AiError::new("backend_closed", "AI 运行环境已关闭。")
}
fn invalid() -> AiError {
    AiError::new("invalid_request", "AI 请求参数无效。")
}

fn expired() -> AiError {
    AiError::new(
        "request_expired",
        "此请求已被执行环境接收，但任务记录已释放或运行环境已重启；为避免重复生成，不会再次执行。",
    )
}

fn history_error() -> AiError {
    AiError::new(
        "history_unavailable",
        "无法保存 AI 请求标识；为避免重复执行，任务未启动。",
    )
}

fn validate_request(request: &AiRequest) -> Result<(), AiError> {
    if request.schema_version != 1 {
        return Err(AiError::new(
            "unsupported_version",
            "不支持此 AI 协议版本。",
        ));
    }
    if [&request.project_id, &request.request_id]
        .iter()
        .any(|id| !identity(id))
        || request.input_revision > 9_007_199_254_740_991
        || serde_json::to_vec(request).map_or(true, |bytes| bytes.len() > REQUEST_LIMIT)
    {
        return Err(invalid());
    }
    let has_job = request.job_id.as_ref().is_some_and(|id| identity(id));
    let keys: &[&str] = match request.operation {
        AiOperation::Start => {
            if request.job_id.is_some() {
                return Err(invalid());
            }
            match request.capability {
                AiCapability::Video => &["workflow"],
                AiCapability::Agent => {
                    if request
                        .payload
                        .get("parentJobId")
                        .is_some_and(|id| !id.as_str().is_some_and(identity))
                    {
                        return Err(invalid());
                    }
                    &["prompt", "maxSteps", "files", "parentJobId"]
                }
            }
        }
        AiOperation::Inspect => {
            if request.job_id.is_some() {
                return Err(invalid());
            }
            &[]
        }
        AiOperation::Artifact => {
            if !has_job
                || !request
                    .payload
                    .get("artifactId")
                    .and_then(Value::as_str)
                    .is_some_and(safe_basename)
            {
                return Err(invalid());
            }
            &["artifactId"]
        }
        AiOperation::Status | AiOperation::Cancel => {
            if !has_job {
                return Err(invalid());
            }
            &[]
        }
    };
    if request
        .payload
        .keys()
        .any(|key| !keys.contains(&key.as_str()))
    {
        return Err(invalid());
    }
    Ok(())
}

fn matching_job<'a>(state: &'a mut State, request: &AiRequest) -> Result<&'a mut Entry, AiError> {
    state
        .jobs
        .iter_mut()
        .find(|entry| {
            Some(&entry.job.job_id) == request.job_id.as_ref()
                && entry.project_id == request.project_id
                && entry.job.capability == request.capability
                && entry.job.input_revision == request.input_revision
        })
        .ok_or_else(|| {
            AiError::new(
                "job_not_found",
                "找不到与此工程、能力和输入版本匹配的任务。",
            )
        })
}

fn append_event(job: &mut AiJob, message: String) {
    if job.events.len() >= 100 {
        job.events.remove(0);
    }
    job.events.push(AiEvent { message });
}

fn conversation_context(
    state: &State,
    request: &AiRequest,
) -> Result<Vec<ContextMessage>, AiError> {
    let Some(parent_id) = request.payload.get("parentJobId").and_then(Value::as_str) else {
        return Ok(Vec::new());
    };
    let unavailable = || {
        AiError::new(
            "context_unavailable",
            "无法继续此对话：上一轮任务不属于当前工程、尚未成功完成，或上下文已释放。请新建对话。",
        )
    };
    let parent = state
        .jobs
        .iter()
        .find(|entry| {
            entry.job.job_id == parent_id
                && entry.project_id == request.project_id
                && entry.job.capability == AiCapability::Agent
                && entry.job.status == AiStatus::Succeeded
        })
        .ok_or_else(unavailable)?;
    let prompt = parent
        .start_request
        .payload
        .get("prompt")
        .and_then(Value::as_str)
        .ok_or_else(unavailable)?;
    let answer = parent
        .job
        .result
        .as_ref()
        .and_then(|result| result.text.as_ref())
        .ok_or_else(unavailable)?;
    if parent.context.len() + 2 > 40
        || parent
            .context
            .iter()
            .map(|message| message.content.len())
            .sum::<usize>()
            + prompt.len()
            + answer.len()
            > 128 * 1024
    {
        return Err(AiError::new(
            "context_limit",
            "对话已达到 20 轮历史或 128 KiB 文字上限，请新建对话。",
        ));
    }
    let mut context = parent.context.clone();
    context.push(ContextMessage {
        role: ContextRole::User,
        content: prompt.into(),
    });
    context.push(ContextMessage {
        role: ContextRole::Assistant,
        content: answer.clone(),
    });
    Ok(context)
}

fn safe_basename(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 255
        && name != "."
        && name != ".."
        && name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-' | b'.'))
}

fn identity(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-'))
}

fn artifact_path(workspace: &Path, artifact: &AiArtifact) -> Result<PathBuf, AiError> {
    let failure = || AiError::new("invalid_artifact", "任务产物路径或大小无效。");
    if !safe_basename(&artifact.id)
        || artifact.name.is_empty()
        || artifact.name.len() > 255
        || artifact.name == "."
        || artifact.name == ".."
        || artifact
            .name
            .contains(['/', '\\', ':', '*', '?', '"', '<', '>', '|'])
        || artifact.name.chars().any(char::is_control)
        || artifact.mime_type.is_empty()
        || artifact.mime_type.len() > 128
        || !artifact.mime_type.contains('/')
        || !artifact
            .mime_type
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"!#$&^_.+-/".contains(&c))
    {
        return Err(failure());
    }
    let directory = workspace.join("artifacts");
    if std::fs::symlink_metadata(&directory)
        .map_err(|_| failure())?
        .file_type()
        .is_symlink()
    {
        return Err(failure());
    }
    let path = directory.join(&artifact.id);
    let metadata = std::fs::symlink_metadata(&path).map_err(|_| failure())?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || (metadata.len() == 0 && artifact.mime_type != "text/plain")
        || metadata.len() > ARTIFACT_LIMIT
    {
        return Err(failure());
    }
    if path.canonicalize().map_err(|_| failure())?.parent()
        != Some(directory.canonicalize().map_err(|_| failure())?.as_path())
    {
        return Err(failure());
    }
    Ok(path)
}

fn validate_result(data: Value, workspace: &Path) -> Result<AiResult, AiError> {
    let result: AiResult = serde_json::from_value(data)
        .map_err(|_| AiError::new("worker_protocol", "AI 任务结果格式无效。"))?;
    if result
        .text
        .as_ref()
        .is_some_and(|text| text.len() > 1024 * 1024)
        || result.artifacts.len() > 128
    {
        return Err(AiError::new(
            "worker_output_limit",
            "AI 任务结果超过大小限制。",
        ));
    }
    let mut ids = std::collections::HashSet::new();
    let mut total = 0;
    for artifact in &result.artifacts {
        if !ids.insert(&artifact.id) {
            return Err(AiError::new("invalid_artifact", "任务产物标识重复。"));
        }
        let path = artifact_path(workspace, artifact)?;
        total += path
            .metadata()
            .map_err(|_| AiError::new("invalid_artifact", "任务产物无法读取。"))?
            .len();
        if total > 128 * 1024 * 1024 {
            return Err(AiError::new("artifact_size", "任务产物总量超过 128 MiB。"));
        }
    }
    Ok(result)
}
