use lmbox_modules::{configure_cfd, package_path, target, Snapshot};
use serde_json::{json, Value};
use std::{fs, path::Path};

fn fixture(root: &Path) -> Snapshot {
    let snapshot: Snapshot = serde_json::from_value(json!({
        "schemaVersion":1, "appVersion":"0.1.1", "target":target(),
        "packages":{"cfd":{
            "id":"cfd","version":"0.1.1","kind":"module","file":"cfd.zip",
            "sha256":"a".repeat(64),"size":1,"unpackedSize":1,"dependencies":[],"uiFiles":[]
        }}
    }))
    .unwrap();
    let package = package_path(root, &snapshot.packages["cfd"]);
    let native = package.join("native");
    for entry in [
        "freecad/bin/python3",
        "paraview/bin/vtkpython",
        "openfoam/etc/bashrc",
    ] {
        let path = native.join(entry);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, "fixture").unwrap();
    }
    fs::create_dir_all(package.join("upstream/CfdOF")).unwrap();
    fs::write(
        package.join("package.json"),
        br#"{"bundledCfdRuntime":true}"#,
    )
    .unwrap();
    fs::write(
        native.join("bundle.json"),
        serde_json::to_vec(&json!({
            "schemaVersion":1,"target":target(),"minimumMacOS":"10.0",
            "entrypoints":{
                "pythonExecutable":"freecad/bin/python3",
                "pvpythonExecutable":"paraview/bin/vtkpython",
                "openfoamDirectory":"openfoam"
            }
        }))
        .unwrap(),
    )
    .unwrap();
    snapshot
}

#[test]
fn bundled_runtime_follows_relocated_installation_without_host_docker() {
    let temporary = tempfile::tempdir().unwrap();
    let original = temporary.path().join("original");
    let snapshot = fixture(&original);
    fs::write(
        original.join("cfd-runtime.json"),
        br#"{"pythonExecutable":"/missing/host","dockerImage":"old","paraviewExecutable":"/missing/gui"}"#,
    )
    .unwrap();
    let moved = temporary.path().join("moved");
    fs::rename(original, &moved).unwrap();
    configure_cfd(&moved, &snapshot, None).unwrap();
    let config: Value =
        serde_json::from_slice(&fs::read(moved.join("cfd-runtime.json")).unwrap()).unwrap();
    for field in [
        "pythonExecutable",
        "upstreamPath",
        "pvpythonExecutable",
        "openfoamDirectory",
    ] {
        assert!(
            Path::new(config[field].as_str().unwrap()).starts_with(moved.canonicalize().unwrap())
        );
    }
    assert!(config.get("dockerImage").is_none());
    assert!(config.get("paraviewExecutable").is_none());
}

#[test]
fn incomplete_or_modified_bundle_does_not_fall_back_to_host() {
    let temporary = tempfile::tempdir().unwrap();
    let snapshot = fixture(temporary.path());
    let native = package_path(temporary.path(), &snapshot.packages["cfd"]).join("native");
    fs::write(
        temporary.path().join("cfd-runtime.json"),
        br#"{"pythonExecutable":"/old/host","dockerImage":"old"}"#,
    )
    .unwrap();
    fs::remove_file(native.join("paraview/bin/vtkpython")).unwrap();
    assert!(configure_cfd(temporary.path(), &snapshot, None).is_err());
    assert!(!temporary.path().join("cfd-runtime.json").exists());
    fs::write(native.join("paraview/bin/vtkpython"), "fixture").unwrap();
    let path = native.join("bundle.json");
    let mut manifest: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    manifest["entrypoints"]["pythonExecutable"] = json!("../../host");
    fs::write(path, serde_json::to_vec(&manifest).unwrap()).unwrap();
    assert!(configure_cfd(temporary.path(), &snapshot, None).is_err());
    fs::remove_dir_all(&native).unwrap();
    assert!(configure_cfd(temporary.path(), &snapshot, None).is_err());
}

#[cfg(unix)]
#[test]
fn bundle_executable_symlink_must_stay_in_bundle() {
    let temporary = tempfile::tempdir().unwrap();
    let snapshot = fixture(temporary.path());
    let native = package_path(temporary.path(), &snapshot.packages["cfd"]).join("native");
    let executable = native.join("freecad/bin/python3");
    fs::remove_file(&executable).unwrap();
    let external = temporary.path().join("external");
    fs::write(&external, "fixture").unwrap();
    std::os::unix::fs::symlink(&external, &executable).unwrap();
    assert!(configure_cfd(temporary.path(), &snapshot, None).is_err());
}

#[cfg(unix)]
#[test]
fn broken_bundle_directory_does_not_select_legacy_host() {
    let temporary = tempfile::tempdir().unwrap();
    let snapshot = fixture(temporary.path());
    let native = package_path(temporary.path(), &snapshot.packages["cfd"]).join("native");
    fs::remove_dir_all(&native).unwrap();
    std::os::unix::fs::symlink("missing-native", &native).unwrap();
    fs::write(
        temporary.path().join("cfd-runtime.json"),
        br#"{"pythonExecutable":"/old/host","dockerImage":"old"}"#,
    )
    .unwrap();
    assert!(configure_cfd(temporary.path(), &snapshot, None).is_err());
    assert!(!temporary.path().join("cfd-runtime.json").exists());
}

#[cfg(target_os = "macos")]
#[test]
fn bundled_runtime_checks_the_host_macos_version_before_configuring() {
    let output = std::process::Command::new("/usr/bin/sw_vers")
        .arg("-productVersion")
        .env("SYSTEM_VERSION_COMPAT", "0")
        .output()
        .unwrap();
    assert!(output.status.success());
    let current = String::from_utf8(output.stdout).unwrap();
    let current = current.trim();
    let mut version = [0_u32; 3];
    for (index, part) in current.split('.').enumerate() {
        version[index] = part.parse().unwrap();
    }
    let temporary = tempfile::tempdir().unwrap();
    let snapshot = fixture(temporary.path());
    let manifest_path =
        package_path(temporary.path(), &snapshot.packages["cfd"]).join("native/bundle.json");
    let mut manifest: Value = serde_json::from_slice(&fs::read(&manifest_path).unwrap()).unwrap();

    // Equality accepts omitted patch components as zero.
    manifest["minimumMacOS"] = json!(format!("{}.{}.{}", version[0], version[1], version[2]));
    fs::write(&manifest_path, serde_json::to_vec(&manifest).unwrap()).unwrap();
    configure_cfd(temporary.path(), &snapshot, None).unwrap();
    assert!(temporary.path().join("cfd-runtime.json").exists());

    for minimum in [
        format!("{}.{}.{}", version[0], version[1], version[2] + 1),
        format!("{}.0", version[0] + 1),
    ] {
        manifest["minimumMacOS"] = json!(minimum);
        fs::write(&manifest_path, serde_json::to_vec(&manifest).unwrap()).unwrap();
        fs::write(
            temporary.path().join("cfd-runtime.json"),
            br#"{"pythonExecutable":"/old/host","dockerImage":"old"}"#,
        )
        .unwrap();
        let error = configure_cfd(temporary.path(), &snapshot, None).unwrap_err();
        assert!(error.contains(&minimum), "{error}");
        assert!(error.contains(current), "{error}");
        assert!(!temporary.path().join("cfd-runtime.json").exists());
    }
}

#[cfg(target_os = "macos")]
#[test]
fn bundled_runtime_rejects_missing_or_malformed_macos_requirements() {
    let temporary = tempfile::tempdir().unwrap();
    let snapshot = fixture(temporary.path());
    let manifest_path =
        package_path(temporary.path(), &snapshot.packages["cfd"]).join("native/bundle.json");
    let mut manifest: Value = serde_json::from_slice(&fs::read(&manifest_path).unwrap()).unwrap();
    for minimum in [Value::Null, json!(13), json!("26.0beta"), json!("13.0.0.1")] {
        manifest["minimumMacOS"] = minimum;
        fs::write(&manifest_path, serde_json::to_vec(&manifest).unwrap()).unwrap();
        let error = configure_cfd(temporary.path(), &snapshot, None).unwrap_err();
        assert!(error.contains("最低 macOS 版本"), "{error}");
        assert!(!temporary.path().join("cfd-runtime.json").exists());
    }
    manifest.as_object_mut().unwrap().remove("minimumMacOS");
    fs::write(&manifest_path, serde_json::to_vec(&manifest).unwrap()).unwrap();
    assert!(configure_cfd(temporary.path(), &snapshot, None).is_err());
}

#[cfg(not(target_os = "macos"))]
#[test]
fn other_platforms_do_not_apply_macos_requirements() {
    let temporary = tempfile::tempdir().unwrap();
    let snapshot = fixture(temporary.path());
    let manifest_path =
        package_path(temporary.path(), &snapshot.packages["cfd"]).join("native/bundle.json");
    let mut manifest: Value = serde_json::from_slice(&fs::read(&manifest_path).unwrap()).unwrap();
    manifest["minimumMacOS"] = json!("999.0");
    fs::write(&manifest_path, serde_json::to_vec(&manifest).unwrap()).unwrap();
    configure_cfd(temporary.path(), &snapshot, None).unwrap();
}
