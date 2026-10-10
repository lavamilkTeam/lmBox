use crate::contracts::PreviewRequest;
use serde_json::{json, Value};
use std::{
    fs,
    io::Write,
    path::Path,
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};

/// A task-local process with bounded lifetime and fixed artifact names.
pub(crate) fn preview(
    request: &PreviewRequest,
    root: &Path,
    cancelled: Arc<AtomicBool>,
) -> Result<Value, String> {
    let mut command = Command::new(root.join(if cfg!(windows) {
        "engine/.venv/Scripts/python.exe"
    } else {
        "engine/.venv/bin/python"
    }));
    command
        .arg("-m")
        .arg("lmbox_geometry")
        .env("PYTHONPATH", root.join("engine/src"));
    execute(request, command, cancelled)
}

pub(crate) fn bundled_preview(
    request: &PreviewRequest,
    worker: &Path,
    cancelled: Arc<AtomicBool>,
) -> Result<Value, String> {
    execute(request, Command::new(worker), cancelled)
}

fn execute(
    request: &PreviewRequest,
    mut command: Command,
    cancelled: Arc<AtomicBool>,
) -> Result<Value, String> {
    if cancelled.load(Ordering::SeqCst) {
        return Err("模型计算已取消或超时。".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let task = tempfile::tempdir().map_err(|_| "无法创建模型任务目录。")?;
    fs::write(
        task.path().join("input.json"),
        serde_json::to_vec(request).map_err(|e| e.to_string())?,
    )
    .map_err(|_| "无法写入模型输入。")?;
    let output = fs::File::create(task.path().join("response.jsonl")).map_err(|e| e.to_string())?;
    let errors = fs::File::create(task.path().join("errors.log")).map_err(|e| e.to_string())?;
    let mut child = command
        .current_dir(task.path())
        .stdin(Stdio::piped())
        .stdout(output)
        .stderr(errors)
        .spawn()
        .map_err(|_| "无法启动模型计算，请检查计算引擎是否完整安装。")?;
    let envelope = json!({"protocolVersion":"1", "projectId":request.project_id,"jobId":request.job_id,"inputRevision":request.input_revision});
    if let Err(error) = writeln!(child.stdin.take().expect("piped stdin"), "{envelope}") {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error.to_string());
    }
    let started = Instant::now();
    loop {
        if cancelled.load(Ordering::SeqCst) || started.elapsed() > Duration::from_secs(60) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("模型计算已取消或超时。".into());
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    return Err("模型计算进程异常退出。".into());
                }
                break;
            }
            Ok(None) => thread::sleep(Duration::from_millis(20)),
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error.to_string());
            }
        }
    }
    let response: Value = serde_json::from_slice(
        &fs::read(task.path().join("response.jsonl")).map_err(|e| e.to_string())?,
    )
    .map_err(|_| "模型计算响应无效。")?;
    if let Some(error) = response.get("error").and_then(Value::as_str) {
        return Err(error.into());
    }
    for key in ["protocolVersion", "projectId", "jobId", "inputRevision"] {
        if response[key] != envelope[key] {
            return Err("模型结果与请求不匹配。".into());
        }
    }
    if response["artifact"] != "mesh.json" {
        return Err("模型产物无效。".into());
    }
    let artifact = task.path().join("mesh.json");
    if fs::metadata(&artifact).map_err(|e| e.to_string())?.len() > 32 * 1024 * 1024 {
        return Err("模型产物超过大小限制。".into());
    }
    let mut mesh: Value = serde_json::from_slice(&fs::read(artifact).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let artifact = mesh.as_object_mut().and_then(|m| m.remove("export"));
    if request.export_format.is_some()
        && artifact.as_ref().and_then(|a| a["format"].as_str()) != request.export_format.as_deref()
    {
        return Err("导出产物格式不匹配。".into());
    }
    Ok(
        json!({"protocolVersion":"1","projectId":request.project_id,"jobId":request.job_id,"inputRevision":request.input_revision,"mesh":mesh,"artifact":artifact}),
    )
}
