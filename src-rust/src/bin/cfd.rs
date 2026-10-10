//! Persistent stdin/stdout host adapter; native session policy lives in the CFD module.
#[cfg(not(target_arch = "wasm32"))]
fn main() {
    use lmbox::contracts::cfd::{CfdErrorInfo, CfdRequest, CfdResponse};
    use lmbox::modules::cfd::CfdBackend;
    use serde_json::Value;
    use std::io::{self, BufRead, Read, Write};
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::{mpsc, Arc};
    const LIMIT: usize = 36 * 1024 * 1024;
    let mut args = std::env::args_os().skip(1);
    let config = args
        .next()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(".tools/cfd/runtime.json"));
    let engine = args
        .next()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("engine/src"));
    let backend = Arc::new(CfdBackend::new(config, engine));
    let ended = Arc::new(AtomicBool::new(false));
    let queued_bytes = Arc::new(AtomicUsize::new(0));
    let (sender, requests) = mpsc::sync_channel::<Vec<u8>>(32);
    let reader_backend = backend.clone();
    let reader_ended = ended.clone();
    let reader_bytes = queued_bytes.clone();
    std::thread::spawn(move || {
        let mut input = io::stdin().lock();
        loop {
            let mut line = Vec::new();
            match (&mut input)
                .take((LIMIT + 1) as u64)
                .read_until(b'\n', &mut line)
            {
                Ok(0) | Err(_) => break,
                Ok(_) => (),
            }
            let oversized = line.len() > LIMIT;
            if reader_bytes.fetch_add(line.len(), Ordering::AcqRel) + line.len() > LIMIT + 1
                || sender.try_send(line).is_err()
            {
                break;
            }
            if oversized {
                break;
            }
        }
        reader_ended.store(true, Ordering::Release);
        // EOF must interrupt an outstanding native ACK wait before the host exits.
        reader_backend.close_all();
    });
    let mut output = io::stdout().lock();
    for line in requests {
        queued_bytes.fetch_sub(line.len(), Ordering::AcqRel);
        let oversized = line.len() > LIMIT;
        let parsed = if oversized {
            Err("CFD 请求超过 36 MiB。".to_owned())
        } else {
            serde_json::from_slice::<CfdRequest>(&line)
                .map_err(|error| format!("CFD 请求格式无效：{error}"))
        };
        let response = match parsed {
            Ok(request) if !ended.load(Ordering::Acquire) => backend.request(request),
            parsed => {
                let value: Value = if oversized {
                    Value::Null
                } else {
                    serde_json::from_slice(&line).unwrap_or(Value::Null)
                };
                let message = parsed
                    .err()
                    .unwrap_or_else(|| "CFD 输入已关闭，会话正在回收。".into());
                CfdResponse {
                    schema_version: 1,
                    project_id: value["projectId"].as_str().unwrap_or("").into(),
                    request_id: value["requestId"].as_str().unwrap_or("").into(),
                    input_revision: value["expectedRevision"].as_u64().unwrap_or(0),
                    revision: 0,
                    ok: false,
                    state: None,
                    artifact: None,
                    error: Some(CfdErrorInfo {
                        code: if oversized {
                            "request_too_large"
                        } else {
                            "invalid_request"
                        }
                        .into(),
                        message,
                        details: None,
                    }),
                }
            }
        };
        if serde_json::to_writer(&mut output, &response).is_err()
            || output
                .write_all(b"\n")
                .and_then(|_| output.flush())
                .is_err()
        {
            break;
        }
        if oversized {
            break;
        }
    }
    backend.close_all();
}

#[cfg(target_arch = "wasm32")]
fn main() {}
