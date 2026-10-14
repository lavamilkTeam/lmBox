//! Installed resource snapshot; no frontend-controlled executable paths.
#[cfg(feature = "modular")]
use tauri::Manager;

#[cfg(feature = "modular")]
struct InstalledModules {
    root: std::path::PathBuf,
    snapshot: lmbox_modules::Snapshot,
}

#[tauri::command]
pub fn module_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    #[cfg(feature = "modular")]
    {
        let state = app.state::<InstalledModules>();
        Ok(
            serde_json::json!({"modular":true, "installed":state.snapshot.packages.values()
            .filter(|p| p.kind == "module").map(|p| p.id.clone()).collect::<Vec<_>>() }),
        )
    }
    #[cfg(not(feature = "modular"))]
    {
        let _ = app;
        Ok(serde_json::json!({"modular":false,"installed":[]}))
    }
}

#[cfg(feature = "modular")]
pub fn runtime(
    app: &tauri::AppHandle,
    id: &str,
    relative: &str,
) -> Result<std::path::PathBuf, String> {
    let state = app.state::<InstalledModules>();
    let p = state
        .snapshot
        .packages
        .get(id)
        .ok_or_else(|| format!("模块尚未安装：{id}"))?;
    Ok(lmbox_modules::package_path(&state.root, p).join(relative))
}

#[cfg(feature = "modular")]
pub fn configure(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    let root = lmbox_modules::default_root().expect("Unable to locate module storage");
    let snapshot = lmbox_modules::installed(&root).expect("Invalid installed module snapshot");
    if snapshot.app_version != env!("CARGO_PKG_VERSION") {
        panic!("Module version does not match desktop host");
    }
    builder.manage(InstalledModules { root, snapshot }).register_uri_scheme_protocol("tauri", |context, request| {
        let state = context.app_handle().state::<InstalledModules>();
        let path = request.uri().path().trim_start_matches('/');
        let path = if path.is_empty() { "index.html" } else { path };
        let content = lmbox_modules::read_ui(&state.root, &state.snapshot, path);
        let mime = match path.rsplit('.').next().unwrap_or("") {
            "html" => "text/html; charset=utf-8", "js" => "text/javascript", "css" => "text/css",
            "json" => "application/json", "wasm" => "application/wasm", "svg" => "image/svg+xml",
            "png" => "image/png", "gif" => "image/gif", "woff2" => "font/woff2", "woff" => "font/woff",
            _ => "application/octet-stream",
        };
        let (status, body) = match content { Ok(bytes) => (200, bytes), Err(_) => (404, b"Module resource not installed".to_vec()) };
        tauri::http::Response::builder().status(status)
            .header("Content-Type", mime).header("X-Content-Type-Options", "nosniff")
            .header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ipc: http://ipc.localhost; worker-src 'self' blob:; media-src 'self' blob:")
            .body(body).unwrap()
    })
}

/// Every IPC entry enforces module installation even if called without its UI.
pub fn require(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    #[cfg(feature = "modular")]
    if !app
        .state::<InstalledModules>()
        .snapshot
        .packages
        .contains_key(id)
    {
        return Err(format!("模块尚未安装：{id}"));
    }
    let _ = (app, id);
    Ok(())
}
