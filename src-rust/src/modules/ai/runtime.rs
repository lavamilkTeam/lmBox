//! The only Python process boundary for AI jobs; all paths originate at the host.
use crate::contracts::ai::{AiCapability, AiError, AiOperation, AiRequest};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc,
    },
    time::{Duration, Instant},
};

const FRAME_LIMIT: usize = 12 * 1024 * 1024;
const OUTPUT_LIMIT: usize = 64 * 1024 * 1024;
const CANCEL_GRACE: Duration = Duration::from_secs(3);

#[derive(Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum ContextRole {
    User,
    Assistant,
}

/// Trusted host-only conversation data, distinct from the frontend request payload.
#[derive(Clone, Serialize)]
pub(super) struct ContextMessage {
    pub(super) role: ContextRole,
    pub(super) content: String,
}

#[derive(Clone)]
pub(super) enum Worker {
    Source { python: PathBuf, engine: PathBuf },
    Bundled(PathBuf),
}

impl Worker {
    fn command(&self) -> Command {
        match self {
            Self::Source { python, engine } => {
                let mut command = Command::new(python);
                command
                    .args(["-u", "-m", "lmbox_geometry.ai_worker"])
                    .env("PYTHONPATH", engine);
                command
            }
            Self::Bundled(worker) => Command::new(worker),
        }
    }

    pub(super) fn run(
        &self,
        request: &AiRequest,
        workspace: &Path,
        context: &[ContextMessage],
        cancelled: &Arc<AtomicBool>,
        mut progress: impl FnMut(String),
    ) -> Result<Value, AiError> {
        if cancelled.load(Ordering::Acquire) {
            return Err(AiError::new("cancelled", "任务已取消。"));
        }
        let mut child = self
            .command()
            .current_dir(workspace)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|_| {
                AiError::new(
                    "runtime_unavailable",
                    "AI Python 执行环境不可用，请配置 AI 运行环境。",
                )
            })?;
        let mut stdin = child.stdin.take().expect("piped stdin");
        let stdout = child.stdout.take().expect("piped stdout");
        let mut stderr = child.stderr.take().expect("piped stderr");
        let envelope = if context.is_empty() {
            json!({"request":request,"workspace":workspace})
        } else {
            json!({"request":request,"workspace":workspace,"context":context})
        };
        let (control, controls) = mpsc::sync_channel::<()>(1);
        let writer = std::thread::spawn(move || {
            if serde_json::to_writer(&mut stdin, &envelope).is_err()
                || stdin.write_all(b"\n").and_then(|_| stdin.flush()).is_err()
            {
                return;
            }
            if controls.recv().is_ok() {
                let _ = stdin
                    .write_all(b"{\"type\":\"cancel\"}\n")
                    .and_then(|_| stdin.flush());
                // Keep stdin open until the owner ends the cancellation grace period.
                let _ = controls.recv();
            }
        });
        let (sender, frames) = mpsc::sync_channel::<Result<Vec<u8>, ()>>(16);
        let reader = std::thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            loop {
                let mut line = Vec::new();
                match (&mut reader)
                    .take((FRAME_LIMIT + 1) as u64)
                    .read_until(b'\n', &mut line)
                {
                    Ok(0) => break,
                    Ok(_) if line.len() <= FRAME_LIMIT => {
                        if sender.send(Ok(line)).is_err() {
                            break;
                        }
                    }
                    _ => {
                        let _ = sender.send(Err(()));
                        break;
                    }
                }
            }
        });
        let stderr_reader = std::thread::spawn(move || {
            let _ = std::io::copy(&mut stderr, &mut std::io::sink());
        });
        let started = Instant::now();
        let timeout = if request.operation == AiOperation::Start {
            Duration::from_secs(2 * 60 * 60)
        } else {
            Duration::from_secs(45)
        };
        let remote_video =
            request.capability == AiCapability::Video && request.operation == AiOperation::Start;
        let cancel_grace = if remote_video {
            Duration::from_secs(20)
        } else {
            CANCEL_GRACE
        };
        let mut timed_out = false;
        let mut cancel_started = None;
        let mut terminal: Option<Result<Value, AiError>> = None;
        let mut terminal_started = None;
        let mut total = 0;
        let outcome = loop {
            timed_out |= started.elapsed() >= timeout;
            if (cancelled.load(Ordering::Acquire) || timed_out) && cancel_started.is_none() {
                let _ = control.try_send(());
                cancel_started = Some(Instant::now());
            }
            if cancel_started.is_some_and(|instant: Instant| instant.elapsed() >= cancel_grace) {
                break Err(if remote_video {
                    AiError::new(
                            "cancellation_unconfirmed",
                            "本地执行已停止，远端视频任务可能仍在运行，取消状态未确认，请检查 ComfyUI 队列。",
                        )
                } else {
                    AiError::new("cancelled", "任务已取消。")
                });
            }
            if terminal_started.is_some_and(|instant: Instant| instant.elapsed() > CANCEL_GRACE) {
                break Err(AiError::new(
                    "worker_exit_timeout",
                    "AI 执行进程未正常退出。",
                ));
            }
            match frames.recv_timeout(Duration::from_millis(20)) {
                Ok(Ok(line)) => {
                    total += line.len();
                    if total > OUTPUT_LIMIT {
                        break Err(AiError::new(
                            "worker_output_limit",
                            "AI 执行输出超过大小限制。",
                        ));
                    }
                    if terminal.is_some() {
                        break Err(protocol_error());
                    }
                    let Ok(frame) = serde_json::from_slice::<Value>(&line) else {
                        break Err(protocol_error());
                    };
                    match frame["type"].as_str() {
                        Some("progress") => {
                            let Some(message) =
                                frame["message"].as_str().filter(|s| s.len() <= 4096)
                            else {
                                break Err(protocol_error());
                            };
                            progress(message.into());
                        }
                        Some("result") if frame["data"].is_object() => {
                            terminal = Some(Ok(frame["data"].clone()));
                            terminal_started = Some(Instant::now());
                        }
                        Some("error") => {
                            let (Some(code), Some(message)) =
                                (frame["code"].as_str(), frame["message"].as_str())
                            else {
                                break Err(protocol_error());
                            };
                            if code.len() > 128 || message.len() > 4096 {
                                break Err(protocol_error());
                            }
                            terminal = Some(Err(AiError::new(code, message)));
                            terminal_started = Some(Instant::now());
                        }
                        _ => break Err(protocol_error()),
                    }
                }
                Ok(Err(())) => {
                    break Err(AiError::new(
                        "worker_output_limit",
                        "AI 执行响应超过大小限制。",
                    ))
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => match child.try_wait() {
                    Ok(Some(status)) if status.success() => {
                        break terminal.unwrap_or_else(|| Err(protocol_error()))
                    }
                    Ok(Some(_)) => {
                        break Err(AiError::new("worker_failed", "AI 执行进程异常退出。"))
                    }
                    Err(_) => break Err(AiError::new("worker_failed", "无法读取 AI 执行状态。")),
                    Ok(None) => std::thread::sleep(Duration::from_millis(10)),
                },
                Err(mpsc::RecvTimeoutError::Timeout) => (),
            }
        };
        drop(control);
        let _ = child.kill();
        let _ = child.wait();
        // Release a blocked bounded-channel send before joining the pipe reader.
        drop(frames);
        let _ = writer.join();
        let _ = reader.join();
        let _ = stderr_reader.join();
        outcome.map_err(|error| {
            if timed_out && error.code == "cancellation_unconfirmed" {
                AiError::new("worker_timeout_unconfirmed", "AI 执行超过两小时等待时限，远端视频任务可能仍在运行，取消状态未确认，请检查 ComfyUI 队列。")
            } else if timed_out && error.code == "cancelled" {
                AiError::new("worker_timeout", "AI 执行超过等待时限，已停止执行。")
            } else { error }
        })
    }
}

fn protocol_error() -> AiError {
    AiError::new("worker_protocol", "AI 执行进程返回了无效响应。")
}
