//! Desktop AI IPC and user-selected binary saving; jobs and paths stay in core.
use lmbox::{
    contracts::ai::{AiRequest, AiResponse},
    modules::ai::AiBackend,
};
use std::{path::PathBuf, sync::Arc};
use tauri::Manager;

pub fn backend(app: &tauri::App) -> Result<Arc<AiBackend>, String> {
    let tasks = app
        .path()
        .app_cache_dir()
        .map_err(|_| "无法定位 AI 任务缓存。")?
        .join("ai");
    let backend = if cfg!(debug_assertions) {
        let repository = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let python = std::env::var_os("LMBOX_AI_PYTHON")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                repository.join(if cfg!(windows) {
                    ".tools/ai/venv/Scripts/python.exe"
                } else {
                    ".tools/ai/venv/bin/python"
                })
            });
        AiBackend::new(python, repository.join("engine/src"), tasks)
    } else {
        #[cfg(not(feature = "modular"))]
        let adjacent = std::env::current_exe()
            .map_err(|_| "无法定位 AI 执行程序。")?
            .with_file_name("ai");
        #[cfg(not(feature = "modular"))]
        let resource = if adjacent.is_dir() {
            adjacent
        } else {
            app.path()
                .resource_dir()
                .map_err(|_| "无法定位 AI 运行资源。")?
                .join("ai")
        };
        #[cfg(feature = "modular")]
        let resource = crate::modules::runtime(app.handle(), "ai-runtime", "ai")
            .unwrap_or_else(|_| tasks.join("unavailable-runtime"));
        AiBackend::bundled(
            resource.join(if cfg!(windows) {
                "lmbox-ai.exe"
            } else {
                "lmbox-ai"
            }),
            tasks,
        )
    };
    Ok(Arc::new(backend))
}

#[tauri::command]
pub async fn ai_request(
    request: AiRequest,
    app: tauri::AppHandle,
    backend: tauri::State<'_, Arc<AiBackend>>,
) -> Result<AiResponse, String> {
    crate::modules::require(
        &app,
        match request.capability {
            lmbox::contracts::ai::AiCapability::Video => "video",
            lmbox::contracts::ai::AiCapability::Agent => "agent",
        },
    )?;
    let backend = Arc::clone(backend.inner());
    tauri::async_runtime::spawn_blocking(move || backend.request(request))
        .await
        .map_err(|_| "AI 请求异常结束。".into())
}

#[tauri::command]
pub async fn save_ai_artifact(
    request: AiRequest,
    app: tauri::AppHandle,
    backend: tauri::State<'_, Arc<AiBackend>>,
) -> Result<bool, String> {
    crate::modules::require(
        &app,
        match request.capability {
            lmbox::contracts::ai::AiCapability::Video => "video",
            lmbox::contracts::ai::AiCapability::Agent => "agent",
        },
    )?;
    let backend = Arc::clone(backend.inner());
    let (artifact, bytes) =
        tauri::async_runtime::spawn_blocking(move || backend.artifact_bytes(&request))
            .await
            .map_err(|_| "无法读取 AI 任务产物。".to_string())?
            .map_err(|error| error.message)?;
    let destination = rfd::AsyncFileDialog::new()
        .set_file_name(&artifact.name)
        .save_file()
        .await;
    let Some(destination) = destination else {
        return Ok(false);
    };
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::write(destination.path(), bytes)
            .map_err(|_| "无法保存任务产物，请检查目标目录权限。".to_string())
    })
    .await
    .map_err(|_| "任务产物保存异常结束。".to_string())??;
    Ok(true)
}
