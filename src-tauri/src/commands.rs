use crate::{
    app::{self, PreviewTasks},
    contracts::PreviewRequest,
};
use std::{path::PathBuf, sync::Arc};
use tauri::Manager;

#[tauri::command]
fn preview_prepare(
    project_id: String,
    job_id: String,
    tasks: tauri::State<'_, Arc<PreviewTasks>>,
) -> Result<(), String> {
    tasks.prepare(project_id, job_id)
}
#[tauri::command]
fn preview_cancel(project_id: String, job_id: String, tasks: tauri::State<'_, Arc<PreviewTasks>>) {
    tasks.cancel(&project_id, &job_id);
}
#[tauri::command]
async fn preview_run(
    request: PreviewRequest,
    app: tauri::AppHandle,
    tasks: tauri::State<'_, Arc<PreviewTasks>>,
) -> Result<serde_json::Value, String> {
    let cancelled = tasks.start(&request.project_id, &request.job_id)?;
    let project = request.project_id.clone();
    let job = request.job_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        // Unbundled CI archives keep resources beside the executable; OS bundles
        // use Tauri's platform-specific resource directory. Neither comes from IPC.
        let adjacent = std::env::current_exe()
            .map_err(|e| e.to_string())?
            .with_file_name("geometry");
        let resources = if adjacent.is_dir() {
            adjacent
        } else {
            app.path()
                .resource_dir()
                .map_err(|e| e.to_string())?
                .join("geometry")
        };
        let worker = resources.join(if cfg!(windows) {
            "lmbox-geometry.exe"
        } else {
            "lmbox-geometry"
        });
        app::build_bundled_preview(&request, &worker, cancelled)
    })
    .await
    .map_err(|_| "模型任务异常结束。".to_string())
    .and_then(|value| value);
    tasks.finish(&project, &job);
    result
}
#[tauri::command]
async fn save_artifact(name: String, content: String) -> Result<bool, String> {
    if content.len() > 32 * 1024 * 1024 || content.is_empty() {
        return Err("导出文件大小无效。".into());
    }
    let filename = PathBuf::from(&name);
    let extension = filename
        .extension()
        .and_then(|s| s.to_str())
        .ok_or("导出格式无效。")?;
    if !["json", "stl", "svg", "dxf"].contains(&extension) || name.contains(['/', '\\']) {
        return Err("导出文件名无效。".into());
    }
    let destination = rfd::AsyncFileDialog::new()
        .set_file_name(&name)
        .add_filter(extension, &[extension])
        .save_file()
        .await;
    let Some(destination) = destination else {
        return Ok(false);
    };
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::write(destination.path(), content)
            .map_err(|_| "无法保存文件，请检查目标目录权限。".to_string())
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(true)
}

pub fn run() {
    tauri::Builder::default()
        .manage(Arc::new(PreviewTasks::default()))
        .invoke_handler(tauri::generate_handler![
            preview_prepare,
            preview_run,
            preview_cancel,
            save_artifact
        ])
        .build(tauri::generate_context!())
        .expect("Unable to initialize lmBox")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                let tasks = Arc::clone(app.state::<Arc<PreviewTasks>>().inner());
                tasks.cancel_all();
                if !tasks.is_idle() {
                    api.prevent_exit();
                    let handle = app.clone();
                    std::thread::spawn(move || {
                        while !tasks.is_idle() {
                            std::thread::sleep(std::time::Duration::from_millis(20));
                        }
                        handle.exit(0);
                    });
                }
            }
        });
}
