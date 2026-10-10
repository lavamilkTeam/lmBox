//! Desktop transport: bounded blocking calls, runtime paths owned by the host.
use lmbox::{
    contracts::propulsion::{DesignRequest, DesignResult},
    modules::propulsion::{CeaBackend, PropulsionBackend},
};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};
use tauri::Manager;

static RUNNING: AtomicUsize = AtomicUsize::new(0);
struct Permit;
impl Drop for Permit {
    fn drop(&mut self) {
        RUNNING.fetch_sub(1, Ordering::SeqCst);
    }
}
fn runtime_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        return Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.tools"));
    }
    app.path()
        .resource_dir()
        .map(|root| root.join("solvers"))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn propulsion_run(
    request: DesignRequest,
    app: tauri::AppHandle,
) -> Result<DesignResult, String> {
    if serde_json::to_vec(&request)
        .map_err(|e| e.to_string())?
        .len()
        > 65_536
    {
        return Err("计算请求超过大小限制。".into());
    }
    RUNNING
        .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |n| {
            (n < 2).then_some(n + 1)
        })
        .map_err(|_| "计算繁忙，请稍后重试。".to_string())?;
    let permit = Permit;
    let root = runtime_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        let design_path = root.join("propulsion/runtime");
        if !design_path.is_dir() {
            return Err("计算引擎尚未安装。开发环境请先运行 npm run build:backend。".into());
        }
        let backend = PropulsionBackend::load(design_path).map_err(|e| e.to_string())?;
        match request {
            DesignRequest::Nozzle(request) => {
                let cea = CeaBackend::load(root.join("cea/runtime")).map_err(|e| e.to_string())?;
                backend
                    .design_nozzle(&cea, &request)
                    .map(|result| DesignResult::Nozzle(Box::new(result)))
                    .map_err(|e| e.to_string())
            }
            DesignRequest::Injector(request) => backend
                .design_injector(&request)
                .map(|result| DesignResult::Injector(Box::new(result)))
                .map_err(|e| e.to_string()),
        }
    })
    .await
    .map_err(|_| "计算任务异常结束。".to_string())?
}
