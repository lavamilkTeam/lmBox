use crate::{package_path, Snapshot};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[cfg(target_os = "macos")]
fn check_macos_version(manifest: &serde_json::Value) -> Result<(), String> {
    fn version(value: &str) -> Option<[u32; 3]> {
        let mut parts = [0; 3];
        let mut count = 0;
        for (index, part) in value.split('.').enumerate() {
            if index >= parts.len() || part.is_empty() || !part.bytes().all(|b| b.is_ascii_digit())
            {
                return None;
            }
            parts[index] = part.parse().ok()?;
            count += 1;
        }
        (count > 0 && parts[0] > 0).then_some(parts)
    }

    let minimum = manifest["minimumMacOS"]
        .as_str()
        .ok_or("CFD 运行库清单缺少最低 macOS 版本。")?;
    let required = version(minimum).ok_or("CFD 运行库清单的最低 macOS 版本无效。")?;
    let output = std::process::Command::new("/usr/bin/sw_vers")
        .arg("-productVersion")
        .env("SYSTEM_VERSION_COMPAT", "0")
        .output()
        .map_err(|error| {
            format!("无法检测 macOS 版本；CFD 运行库最低要求 macOS {minimum}：{error}")
        })?;
    let current = String::from_utf8_lossy(&output.stdout);
    let current = current.trim();
    let Some(actual) = version(current).filter(|_| output.status.success()) else {
        return Err(format!(
            "无法检测有效的 macOS 版本；CFD 运行库最低要求 macOS {minimum}。"
        ));
    };
    if actual < required {
        return Err(format!(
            "CFD 运行库最低要求 macOS {minimum}，当前为 macOS {current}。"
        ));
    }
    Ok(())
}

/// Resolve a signed package's relative runtime entries after installation.
/// Legacy adapter-only packages may still use an explicitly configured host.
pub fn configure(root: &Path, snapshot: &Snapshot, python: Option<&Path>) -> Result<(), String> {
    let Some(package) = snapshot.packages.get("cfd") else {
        return Ok(());
    };
    let config_path = root.join("cfd-runtime.json");
    let package_root = package_path(root, package);
    let native = package_root.join("native");
    let package_manifest: serde_json::Value = fs::read(package_root.join("package.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default();
    if package_manifest["bundledCfdRuntime"] == true || fs::symlink_metadata(&native).is_ok() {
        let result = (|| -> Result<(), String> {
            let package_root = package_root.canonicalize().map_err(|e| e.to_string())?;
            let native = native.canonicalize().map_err(|e| e.to_string())?;
            if !native.starts_with(&package_root) {
                return Err("CFD 运行库目录越界。".into());
            }
            let manifest: serde_json::Value = serde_json::from_slice(
                &fs::read(native.join("bundle.json")).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
            let expected = serde_json::json!({
                "pythonExecutable":"freecad/bin/python3",
                "pvpythonExecutable":"paraview/bin/vtkpython",
                "openfoamDirectory":"openfoam"
            });
            if manifest["schemaVersion"] != 1
                || manifest["target"] != crate::target()
                || manifest["entrypoints"] != expected
            {
                return Err("CFD 运行库清单版本、平台或入口无效。".into());
            }
            #[cfg(target_os = "macos")]
            check_macos_version(&manifest)?;
            for relative in [
                "freecad/bin/python3",
                "paraview/bin/vtkpython",
                "openfoam/etc/bashrc",
            ] {
                let path = native.join(relative);
                if !path.is_file()
                    || !path
                        .canonicalize()
                        .map_err(|e| e.to_string())?
                        .starts_with(&native)
                {
                    return Err(format!("CFD 运行库入口缺失或越界：{relative}"));
                }
            }
            let bundled_python = native.join("freecad/bin/python3");
            let python = python.unwrap_or(&bundled_python);
            if !python.is_absolute() || !python.is_file() {
                return Err("指定的 FreeCAD Python 不存在。".into());
            }
            let upstream = package_root
                .join("upstream")
                .canonicalize()
                .map_err(|e| e.to_string())?;
            if !upstream.starts_with(&package_root) || !upstream.join("CfdOF").is_dir() {
                return Err("CFD 控制器源码缺失或越界。".into());
            }
            let config = serde_json::json!({
                "schemaVersion":1,
                "sourceCommit":"a90f60c2313ceba09c236c81f0693d93357d1614",
                "pythonExecutable":python,
                "upstreamPath":upstream,
                "pvpythonExecutable":native.join("paraview/bin/vtkpython"),
                "openfoamDirectory":native.join("openfoam"),
            });
            fs::write(
                &config_path,
                serde_json::to_vec_pretty(&config).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())
        })();
        if result.is_err() {
            match fs::remove_file(&config_path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(format!("无法清除失效的 CFD 运行配置：{error}")),
            }
        }
        return result;
    }
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
