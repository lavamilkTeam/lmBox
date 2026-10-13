use crate::{package_path, Snapshot};
use std::{
    fs,
    path::{Path, PathBuf},
};

/// Host-local CFD paths never enter release packages. Missing external tools
/// leave CFD unavailable; installing its adapter does not install FreeCAD/Docker.
pub fn configure(root: &Path, snapshot: &Snapshot, python: Option<&Path>) -> Result<(), String> {
    let Some(package) = snapshot.packages.get("cfd") else {
        return Ok(());
    };
    let config_path = root.join("cfd-runtime.json");
    let previous: serde_json::Value = fs::read(&config_path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default();
    let mut candidates = Vec::new();
    if let Some(python) = python {
        candidates.push(python.to_owned());
    }
    if let Some(python) = std::env::var_os("LMBOX_FREECAD_PYTHON") {
        candidates.push(PathBuf::from(python));
    }
    if let Some(python) = previous["pythonExecutable"].as_str() {
        candidates.push(PathBuf::from(python));
    }
    #[cfg(target_os = "macos")]
    for directory in [
        PathBuf::from("/Applications"),
        dirs::home_dir().unwrap_or_default().join("Applications"),
    ] {
        if let Ok(entries) = fs::read_dir(directory) {
            for entry in entries.flatten() {
                if entry.file_name().to_string_lossy().starts_with("FreeCAD") {
                    candidates.push(entry.path().join("Contents/Resources/bin/python"));
                    candidates.push(entry.path().join("Contents/Resources/bin/python3"));
                }
            }
        }
    }
    #[cfg(target_os = "linux")]
    for name in [
        "/usr/bin/freecad-python",
        "/opt/freecad/bin/python",
        "/opt/FreeCAD/bin/python",
    ] {
        candidates.push(PathBuf::from(name));
    }
    #[cfg(windows)]
    if let Some(directory) = std::env::var_os("ProgramFiles") {
        if let Ok(entries) = fs::read_dir(directory) {
            for entry in entries.flatten() {
                if entry.file_name().to_string_lossy().starts_with("FreeCAD") {
                    candidates.push(entry.path().join("bin/python.exe"));
                }
            }
        }
    }
    let Some(python) = candidates
        .into_iter()
        .find(|p| p.is_absolute() && p.is_file())
    else {
        if python.is_some() {
            return Err("指定的 FreeCAD Python 不存在。".into());
        }
        return Ok(());
    };
    let mut config = serde_json::json!({"schemaVersion":1,
        "sourceCommit":"a90f60c2313ceba09c236c81f0693d93357d1614",
        "pythonExecutable":python, "upstreamPath":package_path(root, package).join("upstream"),
        "dockerImage":"mmcker/cfdof-openfoam@sha256:d09be2c8119e6fccc4b9bed2674183fb113d1cca598148efd51ff2f19e60b1d5"});
    for key in ["dockerExecutable", "dockerImage", "paraviewExecutable"] {
        if let Some(value) = previous.get(key) {
            config[key] = value.clone();
        }
    }
    fs::write(
        config_path,
        serde_json::to_vec_pretty(&config).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}
