//! CFD IPC only; native state, revisions and worker lifecycle stay in the Rust core.
use lmbox::{
    contracts::cfd::{CfdOperation, CfdRequest, CfdResponse},
    modules::cfd::CfdBackend,
};
use std::{path::PathBuf, sync::Arc};
use tauri::Manager;

pub fn backend(app: &tauri::App) -> Result<Arc<CfdBackend>, String> {
    let root = if cfg!(debug_assertions) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
    } else {
        app.path()
            .resource_dir()
            .map_err(|error| error.to_string())?
    };
    let config = if cfg!(debug_assertions) {
        root.join(".tools/cfd/runtime.json")
    } else {
        root.join("solvers/cfd/runtime.json")
    };
    Ok(Arc::new(CfdBackend::new(config, root.join("engine/src"))))
}

#[tauri::command]
pub async fn cfd_request(
    request: CfdRequest,
    backend: tauri::State<'_, Arc<CfdBackend>>,
) -> Result<CfdResponse, String> {
    let backend = Arc::clone(backend.inner());
    tauri::async_runtime::spawn_blocking(move || backend.request(request))
        .await
        .map_err(|_| "流体分析任务异常结束。".to_string())
}

/// Host-selected paths never enter the frontend transport or a generic file API.
#[tauri::command]
pub async fn choose_cfd_path(
    request: CfdRequest,
    backend: tauri::State<'_, Arc<CfdBackend>>,
) -> Result<CfdResponse, String> {
    if request.operation != CfdOperation::DialogResponse || request.payload.len() != 1 {
        return Err("文件选择请求无效。".into());
    }
    let dialog_id = request
        .payload
        .get("dialogId")
        .and_then(serde_json::Value::as_str)
        .ok_or("缺少当前文件对话框标识。")?
        .to_owned();
    let core = Arc::clone(backend.inner());
    let mut inspect = request.clone();
    inspect.operation = CfdOperation::Poll;
    inspect.payload.clear();
    let snapshot = tauri::async_runtime::spawn_blocking(move || core.request(inspect))
        .await
        .map_err(|_| "无法读取当前文件对话框。".to_string())?;
    if !snapshot.ok {
        return Ok(snapshot);
    }
    let descriptor = snapshot
        .state
        .as_ref()
        .and_then(|state| state["dialogs"].as_array())
        .and_then(|dialogs| dialogs.iter().find(|dialog| dialog["id"] == dialog_id))
        .and_then(|dialog| dialog.get("fileDialog"))
        .ok_or("当前文件对话框已关闭。")?;
    let mode = descriptor["mode"].as_str().ok_or("文件对话框模式无效。")?;
    let mut picker = rfd::AsyncFileDialog::new().set_title(match mode {
        "directory" => "选择目录",
        "saveFile" => "保存文件",
        "openFile" => "打开文件",
        _ => return Err("文件对话框模式无效。".into()),
    });
    if let Some(filters) = descriptor["filters"].as_array() {
        for filter in filters.iter().filter_map(serde_json::Value::as_str) {
            let extensions: Vec<&str> = filter
                .split(['(', ')', ' ', ';'])
                .filter_map(|part| part.strip_prefix("*."))
                .filter(|extension| {
                    !extension.is_empty() && extension.chars().all(|c| c.is_ascii_alphanumeric())
                })
                .collect();
            if !extensions.is_empty() {
                picker = picker.add_filter(extensions.join(" / "), &extensions);
            }
        }
    }
    let selected = match mode {
        "directory" => picker.pick_folder().await,
        "saveFile" => picker.save_file().await,
        _ => picker.pick_file().await,
    };
    let path = selected.map(|file| file.path().to_owned());
    let core = Arc::clone(backend.inner());
    tauri::async_runtime::spawn_blocking(move || core.select_dialog_path(request, path))
        .await
        .map_err(|_| "文件选择处理失败。".to_string())
}

#[tauri::command]
pub async fn save_cfd_document(name: String, bytes: Vec<u8>) -> Result<bool, String> {
    if bytes.is_empty() || bytes.len() > 24 * 1024 * 1024 {
        return Err("工程文件为空或超过大小限制。".into());
    }
    if name.contains(['/', '\\']) || !name.to_ascii_lowercase().ends_with(".fcstd") {
        return Err("工程文件名无效。".into());
    }
    let destination = rfd::AsyncFileDialog::new()
        .set_file_name(&name)
        .add_filter("FreeCAD 工程", &["FCStd"])
        .save_file()
        .await;
    let Some(destination) = destination else {
        return Ok(false);
    };
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::write(destination.path(), bytes)
            .map_err(|_| "无法保存工程，请检查目标目录权限。".to_string())
    })
    .await
    .map_err(|error| error.to_string())??;
    Ok(true)
}
