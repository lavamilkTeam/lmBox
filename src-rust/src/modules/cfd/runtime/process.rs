use crate::contracts::cfd::CfdErrorInfo;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tempfile::TempDir;

pub(super) const SOURCE_COMMIT: &str = "a90f60c2313ceba09c236c81f0693d93357d1614";
pub(in crate::modules::cfd) const MAX_FRAME: usize = 36 * 1024 * 1024;
const MAX_LOG: usize = 64 * 1024;

pub(in crate::modules::cfd) type WorkerError = CfdErrorInfo;

pub(in crate::modules::cfd) fn failure(code: &str, message: impl Into<String>) -> WorkerError {
    CfdErrorInfo {
        code: code.into(),
        message: message.into(),
        details: None,
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::modules::cfd) struct RuntimeConfig {
    schema_version: u32,
    source_commit: String,
    python_executable: PathBuf,
    upstream_path: PathBuf,
    docker_executable: Option<PathBuf>,
    docker_image: Option<String>,
    paraview_executable: Option<PathBuf>,
}

impl RuntimeConfig {
    pub(in crate::modules::cfd) fn load(path: &Path) -> Result<Self, WorkerError> {
        let file = fs::File::open(path).map_err(|_| {
            failure(
                "runtime_unavailable",
                "尚未配置 CFD 运行环境，请运行 npm run setup:cfd。",
            )
        })?;
        let mut bytes = Vec::new();
        file.take(65537)
            .read_to_end(&mut bytes)
            .map_err(|e| failure("runtime_config", e.to_string()))?;
        if bytes.len() > 65536 {
            return Err(failure("runtime_config", "CFD 运行配置过大。"));
        }
        let config: Self = serde_json::from_slice(&bytes)
            .map_err(|e| failure("runtime_config", format!("CFD 运行配置无效：{e}")))?;
        if config.schema_version != 1 || config.source_commit != SOURCE_COMMIT {
            return Err(failure(
                "runtime_config",
                "CFD 运行环境版本与固定源版本不匹配，请重新运行 setup:cfd。",
            ));
        }
        if !config.python_executable.is_absolute()
            || !config.python_executable.is_file()
            || !config.upstream_path.is_absolute()
            || !config.upstream_path.join("CfdOF").is_dir()
        {
            return Err(failure(
                "runtime_unavailable",
                "FreeCAD Python 或 CfdOF 源文件缺失，请重新运行 setup:cfd。",
            ));
        }
        Ok(config)
    }
}

pub(in crate::modules::cfd) struct Worker {
    child: Child,
    stdin: Option<mpsc::SyncSender<Vec<u8>>>,
    docker: Option<PathBuf>,
    container_name: String,
    responses: mpsc::Receiver<Result<Value, String>>,
    logs: Arc<Mutex<VecDeque<u8>>>,
    directory: TempDir,
    sequence: u64,
    started: bool,
    stopped: bool,
    cancellation: Arc<AtomicBool>,
}

impl Worker {
    pub(in crate::modules::cfd) fn start(
        config: RuntimeConfig,
        engine_source: &Path,
        cancellation: Arc<AtomicBool>,
    ) -> Result<Self, WorkerError> {
        if !engine_source.join("lmbox_geometry/cfd_worker.py").is_file() {
            return Err(failure(
                "runtime_unavailable",
                "CFD Python 适配器缺失，请检查引擎安装。",
            ));
        }
        let directory = tempfile::Builder::new()
            .prefix("lmbox-cfd-")
            .tempdir()
            .map_err(|e| failure("session_io", e.to_string()))?;
        fs::create_dir(directory.path().join("imports"))
            .map_err(|e| failure("session_io", e.to_string()))?;
        let mut command = Command::new(&config.python_executable);
        command
            .args(["-u", "-m", "lmbox_geometry.cfd_worker", "--upstream"])
            .arg(&config.upstream_path)
            .arg("--session")
            .arg(directory.path())
            .env("PYTHONPATH", engine_source)
            .env("PYTHONDONTWRITEBYTECODE", "1")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let container_name = directory
            .path()
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        command.arg("--container-name").arg(&container_name);
        let docker = config.docker_executable.clone().or_else(|| {
            config
                .docker_image
                .as_ref()
                .map(|_| PathBuf::from("docker"))
        });
        if let Some(value) = config.docker_executable {
            command.arg("--docker-executable").arg(value);
        }
        if let Some(value) = config.docker_image {
            command.arg("--docker-image").arg(value);
        }
        if let Some(value) = config.paraview_executable {
            command.arg("--paraview-executable").arg(value);
        }
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        let mut child = command
            .spawn()
            .map_err(|e| failure("worker_start", format!("无法启动 FreeCAD 工作进程：{e}")))?;
        let mut input = child.stdin.take().expect("piped stdin");
        let (writer, input_messages) = mpsc::sync_channel::<Vec<u8>>(1);
        thread::spawn(move || {
            for message in input_messages {
                if input
                    .write_all(&message)
                    .and_then(|_| input.write_all(b"\n"))
                    .and_then(|_| input.flush())
                    .is_err()
                {
                    break;
                }
            }
        });
        let stdin = Some(writer);
        let stdout = child.stdout.take().expect("piped stdout");
        let stderr = child.stderr.take().expect("piped stderr");
        let (sender, responses) = mpsc::sync_channel(8);
        thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            loop {
                let mut line = Vec::new();
                let result = (&mut reader)
                    .take((MAX_FRAME + 1) as u64)
                    .read_until(b'\n', &mut line);
                let frame = match result {
                    Ok(0) => break,
                    Ok(_) if line.len() > MAX_FRAME => Err("CFD 工作进程响应超过 36 MiB。".into()),
                    Ok(_) => serde_json::from_slice::<Value>(&line)
                        .map_err(|e| format!("CFD 工作进程返回无效 JSON：{e}")),
                    Err(e) => Err(format!("无法读取 CFD 工作进程：{e}")),
                };
                let invalid = frame.is_err();
                if sender.send(frame).is_err() || invalid {
                    break;
                }
            }
        });
        let logs = Arc::new(Mutex::new(VecDeque::new()));
        let log_sink = logs.clone();
        thread::spawn(move || {
            let mut reader = stderr;
            let mut buffer = [0_u8; 4096];
            while let Ok(size) = reader.read(&mut buffer) {
                if size == 0 {
                    break;
                }
                let Ok(mut log) = log_sink.lock() else {
                    break;
                };
                for byte in &buffer[..size] {
                    if log.len() == MAX_LOG {
                        log.pop_front();
                    }
                    log.push_back(*byte);
                }
            }
        });
        Ok(Self {
            child,
            stdin,
            responses,
            logs,
            directory,
            docker,
            container_name,
            sequence: 0,
            started: false,
            stopped: false,
            cancellation,
        })
    }

    pub(in crate::modules::cfd) fn request(
        &mut self,
        operation: &str,
        payload: Value,
        request_id: &str,
    ) -> Result<Value, WorkerError> {
        self.sequence += 1;
        let id = format!("{request_id}:{}", self.sequence);
        let message = serde_json::to_vec(&json!({"id":id,"operation":operation,"payload":payload}))
            .map_err(|e| failure("worker_protocol", e.to_string()))?;
        if message.len() > MAX_FRAME {
            return Err(failure("request_too_large", "CFD 请求超过 36 MiB。"));
        }
        let stdin = self
            .stdin
            .as_ref()
            .ok_or_else(|| failure("worker_closed", "CFD 会话已关闭。"))?;
        stdin.try_send(message).map_err(|e| match e {
            mpsc::TrySendError::Disconnected(_) => self.with_logs(
                "worker_stopped",
                "CFD 工作进程已退出，未保存的原生文档无法恢复。请关闭会话后重新初始化。",
            ),
            mpsc::TrySendError::Full(_) => failure(
                "worker_busy",
                "CFD 工作进程正在接收上一条操作，请稍后重试。",
            ),
        })?;
        let duration = if self.started {
            Duration::from_secs(30)
        } else {
            Duration::from_secs(90)
        };
        let deadline = Instant::now() + duration;
        loop {
            if self.cancellation.load(Ordering::Acquire) {
                return Err(failure("session_closed", "CFD 宿主正在关闭会话。"));
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            match self
                .responses
                .recv_timeout(remaining.min(Duration::from_millis(100)))
            {
                Ok(Ok(mut response)) => {
                    if response.get("id").and_then(Value::as_str) != Some(&id) {
                        continue;
                    }
                    self.started = true;
                    if !response.get("ok").is_some_and(Value::is_boolean)
                        || !response.get("state").is_some_and(Value::is_object)
                    {
                        return Err(self.with_logs("worker_protocol", "CFD 工作进程响应字段无效。"));
                    }
                    for pointer in [
                        "/state/lastAction/requestId",
                        "/state/pendingAction/requestId",
                    ] {
                        if let Some(id) = response.pointer_mut(pointer) {
                            if let Some(original) = id
                                .as_str()
                                .and_then(|id| id.rsplit_once(':'))
                                .map(|(original, _)| original.to_owned())
                            {
                                *id = Value::String(original);
                            }
                        }
                    }
                    return Ok(response);
                }
                Ok(Err(message)) => return Err(self.with_logs("worker_protocol", &message)),
                Err(mpsc::RecvTimeoutError::Timeout) if Instant::now() < deadline => continue,
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    return Err(self.with_logs(
                        "worker_timeout",
                        "CFD 工作进程尚未回应，可继续查询状态或关闭会话。",
                    ))
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Err(self.with_logs(
                        "worker_stopped",
                        "CFD 工作进程已退出，未保存的原生文档无法恢复。请关闭会话后重新初始化。",
                    ))
                }
            }
        }
    }

    pub(in crate::modules::cfd) fn is_running(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    pub(in crate::modules::cfd) fn stage_import(
        &mut self,
        name: &str,
        bytes: &[u8],
    ) -> Result<PathBuf, WorkerError> {
        let directory = self
            .directory
            .path()
            .join("imports")
            .join((self.sequence + 1).to_string());
        fs::create_dir(&directory)
            .map_err(|e| failure("import_io", format!("无法准备导入目录：{e}")))?;
        let path = directory.join(name);
        fs::write(&path, bytes)
            .map_err(|e| failure("import_io", format!("无法准备导入文件：{e}")))?;
        Ok(path)
    }

    pub(in crate::modules::cfd) fn validate_host_path(
        &self,
        mode: &str,
        path: Option<&Path>,
    ) -> Result<(), WorkerError> {
        if !["openFile", "directory", "saveFile"].contains(&mode) {
            return Err(failure("invalid_dialog", "未知原生文件选择模式。"));
        }
        let Some(path) = path else {
            return Ok(());
        };
        if !path.is_absolute() {
            return Err(failure("invalid_path", "原生选择器必须返回绝对路径。"));
        }
        let valid = match mode {
            "directory" => path.is_dir(),
            "openFile" => path.is_file(),
            "saveFile" => path.parent().is_some_and(Path::is_dir) && !path.is_dir(),
            _ => false,
        };
        if !valid {
            return Err(failure("invalid_path", "所选文件或目录不可用。"));
        }
        Ok(())
    }

    pub(in crate::modules::cfd) fn export_document(&self) -> Result<Vec<u8>, WorkerError> {
        let path = self.directory.path().join("session.FCStd");
        let metadata = fs::symlink_metadata(&path)
            .map_err(|e| failure("export_io", format!("文档尚未导出：{e}")))?;
        if !metadata.is_file()
            || metadata.file_type().is_symlink()
            || metadata.len() > 24 * 1024 * 1024
        {
            return Err(failure(
                "export_too_large",
                "导出文档必须为不超过 24 MiB 的会话文件。",
            ));
        }
        fs::read(path).map_err(|e| failure("export_io", e.to_string()))
    }

    fn with_logs(&self, code: &str, message: &str) -> WorkerError {
        let mut error = failure(code, message);
        if let Ok(log) = self.logs.lock() {
            let bytes: Vec<_> = log.iter().copied().collect();
            if !bytes.is_empty() {
                error.details = Some(json!({"log":String::from_utf8_lossy(&bytes)}));
            }
        }
        error
    }

    pub(in crate::modules::cfd) fn shutdown(&mut self) {
        if self.stopped {
            return;
        }
        self.stopped = true;
        // EOF lets the worker perform its own document/container cleanup first.
        self.stdin.take();
        let deadline = Instant::now() + Duration::from_secs(3);
        while Instant::now() < deadline {
            if self.child.try_wait().ok().flatten().is_some() {
                terminate_tree(&mut self.child);
                self.cleanup_container();
                return;
            }
            thread::sleep(Duration::from_millis(25));
        }
        terminate_tree(&mut self.child);
        self.cleanup_container();
    }

    fn cleanup_container(&self) {
        let Some(executable) = &self.docker else {
            return;
        };
        let Ok(mut cleanup) = Command::new(executable)
            .args(["rm", "-f", &self.container_name])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
        else {
            return;
        };
        let deadline = Instant::now() + Duration::from_secs(3);
        while Instant::now() < deadline {
            if cleanup.try_wait().ok().flatten().is_some() {
                return;
            }
            thread::sleep(Duration::from_millis(25));
        }
        let _ = cleanup.kill();
        let _ = cleanup.wait();
    }
}

impl Drop for Worker {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn terminate_tree(child: &mut Child) {
    #[cfg(unix)]
    {
        let group = format!("-{}", child.id());
        let _ = Command::new("/bin/kill")
            .args(["-TERM", "--", &group])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        thread::sleep(Duration::from_millis(100));
        let _ = Command::new("/bin/kill")
            .args(["-KILL", "--", &group])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}
