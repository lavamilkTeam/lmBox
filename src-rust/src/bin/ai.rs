//! Persistent development transport; task ownership remains in modules::ai.
#[cfg(not(target_arch = "wasm32"))]
fn main() {
    use lmbox::{
        contracts::ai::{AiCapability, AiError, AiOperation, AiRequest, AiResponse},
        modules::ai::AiBackend,
    };
    use serde_json::{Map, Value};
    use std::{
        io::{self, BufRead, Read, Write},
        path::PathBuf,
        sync::{
            atomic::{AtomicUsize, Ordering},
            mpsc, Arc, Mutex,
        },
    };
    const LIMIT: usize = 4 * 1024 * 1024;
    let mut args = std::env::args_os().skip(1);
    let Some(python) = args.next().map(PathBuf::from) else {
        eprintln!("Usage: ai <python> <engine-source> <task-directory> [<node> <agent-entry>]");
        return;
    };
    let Some(engine) = args.next().map(PathBuf::from) else {
        eprintln!("Missing engine source directory");
        return;
    };
    let Some(root) = args.next().map(PathBuf::from) else {
        eprintln!("Missing task directory");
        return;
    };
    let mut backend = AiBackend::new(python, engine, root);
    match (args.next(), args.next(), args.next()) {
        (Some(node), Some(entry), None) => {
            backend = backend.with_agent_worker(node.into(), entry.into());
        }
        (None, None, None) => (),
        _ => {
            eprintln!("Agent runtime requires both Node.js and its entry path.");
            return;
        }
    }
    let backend = Arc::new(backend);
    let queued = Arc::new(AtomicUsize::new(0));
    let (sender, requests) = mpsc::sync_channel::<Vec<u8>>(32);
    let reader_backend = Arc::clone(&backend);
    let reader_queued = Arc::clone(&queued);
    std::thread::spawn(move || {
        let mut input = io::stdin().lock();
        loop {
            let mut line = Vec::new();
            if !matches!((&mut input).take((LIMIT + 1) as u64).read_until(b'\n', &mut line), Ok(n) if n > 0)
            {
                break;
            }
            let oversized = line.len() > LIMIT;
            if reader_queued.fetch_add(line.len(), Ordering::AcqRel) + line.len() > LIMIT * 2
                || sender.try_send(line).is_err()
            {
                break;
            }
            if oversized {
                break;
            }
        }
        reader_backend.close_all();
    });
    let output = Arc::new(Mutex::new(io::stdout()));
    let inspecting = Arc::new(AtomicUsize::new(0));
    let mut inspectors: Vec<std::thread::JoinHandle<()>> = Vec::new();
    for line in requests {
        queued.fetch_sub(line.len(), Ordering::AcqRel);
        let oversized = line.len() > LIMIT;
        let response = if !oversized {
            match serde_json::from_slice::<AiRequest>(&line) {
                Ok(request) if request.operation == AiOperation::Inspect => {
                    if inspecting
                        .fetch_update(Ordering::AcqRel, Ordering::Acquire, |count| {
                            (count < 2).then_some(count + 1)
                        })
                        .is_ok()
                    {
                        inspectors.retain(|thread| !thread.is_finished());
                        let backend = Arc::clone(&backend);
                        let output = Arc::clone(&output);
                        let inspecting = Arc::clone(&inspecting);
                        inspectors.push(std::thread::spawn(move || {
                            let response = backend.request(request);
                            if !write_response(&output, &response) {
                                backend.close_all();
                            }
                            inspecting.fetch_sub(1, Ordering::AcqRel);
                        }));
                        continue;
                    }
                    AiResponse::for_request(
                        &request,
                        Err(AiError::new("busy", "AI 能力检查繁忙，请稍后重试。")),
                    )
                }
                Ok(request) => backend.request(request),
                Err(_) => {
                    let value: Value = serde_json::from_slice(&line).unwrap_or(Value::Null);
                    let request = AiRequest {
                        schema_version: 1,
                        project_id: value["projectId"].as_str().unwrap_or("").into(),
                        request_id: value["requestId"].as_str().unwrap_or("").into(),
                        input_revision: value["inputRevision"].as_u64().unwrap_or(0),
                        capability: serde_json::from_value(value["capability"].clone())
                            .unwrap_or(AiCapability::Agent),
                        operation: AiOperation::Inspect,
                        job_id: None,
                        payload: Map::new(),
                    };
                    AiResponse::for_request(
                        &request,
                        Err(AiError::new("invalid_request", "AI 请求格式无效。")),
                    )
                }
            }
        } else {
            let request = AiRequest {
                schema_version: 1,
                project_id: String::new(),
                request_id: String::new(),
                input_revision: 0,
                capability: AiCapability::Agent,
                operation: AiOperation::Inspect,
                job_id: None,
                payload: Map::new(),
            };
            AiResponse::for_request(
                &request,
                Err(AiError::new("request_too_large", "AI 请求超过大小限制。")),
            )
        };
        if !write_response(&output, &response) {
            break;
        }
        if oversized {
            break;
        }
    }
    backend.close_all();
    for inspector in inspectors {
        let _ = inspector.join();
    }

    fn write_response(output: &Mutex<io::Stdout>, response: &AiResponse) -> bool {
        let mut output = output.lock().unwrap();
        serde_json::to_writer(&mut *output, response).is_ok()
            && output.write_all(b"\n").and_then(|_| output.flush()).is_ok()
    }
}

#[cfg(target_arch = "wasm32")]
fn main() {}
