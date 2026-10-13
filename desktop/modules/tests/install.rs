use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::{Signer, SigningKey};
use lmbox_modules::{
    install, installed, load_catalog, package_path, read_ui, remove, target, Catalog, Package,
};
use sha2::{Digest, Sha256};
use std::{fs, io::Write, path::Path};
use zip::write::SimpleFileOptions;

fn package(source: &Path, id: &str, dependencies: &[&str], extra: &[(&str, &[u8])]) -> Package {
    let file = format!("{id}.zip");
    let mut archive = zip::ZipWriter::new(fs::File::create(source.join(&file)).unwrap());
    let manifest =
        serde_json::to_vec(&serde_json::json!({"id":id,"version":"0.1.1","target":target()}))
            .unwrap();
    let mut size = manifest.len() as u64;
    archive
        .start_file("package.json", SimpleFileOptions::default())
        .unwrap();
    archive.write_all(&manifest).unwrap();
    for (path, bytes) in extra {
        archive
            .start_file(*path, SimpleFileOptions::default().unix_permissions(0o755))
            .unwrap();
        archive.write_all(bytes).unwrap();
        size += bytes.len() as u64;
    }
    archive.finish().unwrap();
    let bytes = fs::read(source.join(&file)).unwrap();
    Package {
        id: id.into(),
        version: "0.1.1".into(),
        kind: if id == "base" {
            "base"
        } else if id == "shared" {
            "runtime"
        } else {
            "module"
        }
        .into(),
        file,
        sha256: hex::encode(Sha256::digest(&bytes)),
        size: bytes.len() as u64,
        unpacked_size: size,
        dependencies: dependencies.iter().map(|s| s.to_string()).collect(),
        ui_files: extra
            .iter()
            .filter_map(|(p, _)| p.strip_prefix("ui/").map(str::to_owned))
            .collect(),
    }
}
fn catalog(source: &Path, packages: Vec<Package>) -> (String, [u8; 32]) {
    let catalog = Catalog {
        schema_version: 1,
        app_version: "0.1.1".into(),
        target: target(),
        packages,
    };
    let bytes = serde_json::to_vec(&catalog).unwrap();
    let key = SigningKey::from_bytes(&[17; 32]);
    fs::write(source.join("catalog.json"), serde_json::to_vec(&serde_json::json!({"payload":STANDARD.encode(&bytes),"signature":hex::encode(key.sign(&bytes).to_bytes())})).unwrap()).unwrap();
    (
        url::Url::from_file_path(source.join("catalog.json"))
            .unwrap()
            .to_string(),
        key.verifying_key().to_bytes(),
    )
}
#[test]
fn selected_modules_dependencies_addition_removal_and_snapshot_isolation() {
    let source = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let base = package(source.path(), "base", &[], &[("ui/index.html", b"base")]);
    let shared = package(
        source.path(),
        "shared",
        &["base"],
        &[
            ("ui/shared.js", b"shared"),
            ("runtime/Lorem ipsum.txt", b"vendor resource"),
        ],
    );
    let nozzle = package(
        source.path(),
        "nozzle",
        &["shared"],
        &[("ui/nozzle.js", b"nozzle")],
    );
    let agent = package(
        source.path(),
        "agent",
        &["shared"],
        &[("ui/agent.js", b"agent")],
    );
    let (url, key) = catalog(source.path(), vec![base, shared, nozzle, agent]);
    let first = install(root.path(), &url, &key, &["nozzle".into()], |_| {}).unwrap();
    assert_eq!(first.packages.len(), 3);
    assert!(!first.packages.contains_key("agent"));
    assert!(read_ui(root.path(), &first, "assets/../../installed.json").is_err());
    assert!(read_ui(root.path(), &first, "agent.js").is_err());
    assert_eq!(
        read_ui(root.path(), &first, "nozzle.js").unwrap(),
        b"nozzle"
    );
    // Already installed payloads need no downloads during a supplemental install.
    fs::remove_file(source.path().join("base.zip")).unwrap();
    let second = install(root.path(), &url, &key, &["agent".into()], |_| {}).unwrap();
    assert_eq!(second.packages.len(), 4);
    let removed = remove(root.path(), &["nozzle".into()]).unwrap();
    assert!(!removed.packages.contains_key("nozzle"));
    assert!(removed.packages.contains_key("shared"));
    assert!(read_ui(root.path(), &removed, "nozzle.js").is_err());
    assert_eq!(
        read_ui(root.path(), &first, "nozzle.js").unwrap(),
        b"nozzle"
    );
    assert!(package_path(root.path(), &first.packages["nozzle"]).is_dir());
}
#[test]
fn tampered_catalog_and_zip_preserve_previous_install_and_allow_retry() {
    let source = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let base = package(source.path(), "base", &[], &[("ui/index.html", b"base")]);
    let nozzle = package(
        source.path(),
        "nozzle",
        &["base"],
        &[("ui/nozzle.js", b"nozzle")],
    );
    let (url, key) = catalog(source.path(), vec![base, nozzle]);
    assert!(load_catalog(&url, &[0; 32]).is_err());
    install(root.path(), &url, &key, &[], |_| {}).unwrap();
    let before = fs::read(root.path().join("installed.json")).unwrap();
    let original = fs::read(source.path().join("nozzle.zip")).unwrap();
    fs::write(source.path().join("nozzle.zip"), b"invalid archive").unwrap();
    assert!(install(root.path(), &url, &key, &["nozzle".into()], |_| {}).is_err());
    assert_eq!(
        fs::read(root.path().join("installed.json")).unwrap(),
        before
    );
    fs::write(source.path().join("nozzle.zip"), original).unwrap();
    assert!(install(root.path(), &url, &key, &["nozzle".into()], |_| {}).is_ok());
}
#[test]
fn traversal_archive_rejected_before_activation() {
    let source = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let base = package(source.path(), "base", &[], &[("../escape", b"bad")]);
    let (url, key) = catalog(source.path(), vec![base]);
    assert!(install(root.path(), &url, &key, &[], |_| {}).is_err());
    assert!(installed(root.path()).unwrap().packages.is_empty());
    assert!(!root.path().join("escape").exists());
}
#[test]
fn dependency_cycle_rejected_without_installing_payloads() {
    let source = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let base = package(source.path(), "base", &["shared"], &[]);
    let shared = package(source.path(), "shared", &["base"], &[]);
    let (url, key) = catalog(source.path(), vec![base, shared]);
    assert!(install(root.path(), &url, &key, &[], |_| {}).is_err());
    assert!(installed(root.path()).unwrap().packages.is_empty());
}

#[test]
fn http_downloads_only_requested_payloads_and_dependencies() {
    use std::io::Read;
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    };
    let source = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let base = package(source.path(), "base", &[], &[("ui/index.html", b"base")]);
    let nozzle = package(
        source.path(),
        "nozzle",
        &["base"],
        &[("ui/nozzle.js", b"nozzle")],
    );
    let agent = package(
        source.path(),
        "agent",
        &["base"],
        &[("ui/agent.js", b"agent")],
    );
    let (_, key) = catalog(source.path(), vec![base, nozzle, agent]);
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    listener.set_nonblocking(true).unwrap();
    let requests = Arc::new(Mutex::new(Vec::new()));
    let records = requests.clone();
    let stop = Arc::new(AtomicBool::new(false));
    let finished = stop.clone();
    let directory = source.path().to_owned();
    let server = std::thread::spawn(move || {
        while !finished.load(Ordering::Relaxed) {
            let Ok((mut socket, _)) = listener.accept() else {
                std::thread::sleep(std::time::Duration::from_millis(2));
                continue;
            };
            socket
                .set_read_timeout(Some(std::time::Duration::from_secs(2)))
                .unwrap();
            let mut request = [0; 4096];
            let size = socket.read(&mut request).unwrap();
            let line = std::str::from_utf8(&request[..size])
                .unwrap()
                .lines()
                .next()
                .unwrap();
            let path = line
                .split_whitespace()
                .nth(1)
                .unwrap()
                .trim_start_matches('/');
            records.lock().unwrap().push(path.to_owned());
            let bytes = fs::read(directory.join(path)).unwrap();
            write!(
                socket,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                bytes.len()
            )
            .unwrap();
            socket.write_all(&bytes).unwrap();
        }
    });
    let result = install(
        root.path(),
        &format!("http://{address}/catalog.json"),
        &key,
        &["nozzle".into()],
        |_| {},
    );
    stop.store(true, Ordering::Relaxed);
    server.join().unwrap();
    assert!(result.is_ok(), "{result:?}");
    assert_eq!(
        *requests.lock().unwrap(),
        vec!["catalog.json", "base.zip", "nozzle.zip"]
    );
}

#[cfg(unix)]
#[test]
fn executable_permissions_and_safe_symlinks_survive_zip_installation() {
    use std::os::unix::fs::PermissionsExt;
    let source = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let mut base = package(
        source.path(),
        "base",
        &[],
        &[("native/bin/worker", b"worker")],
    );
    let zipfile = source.path().join("base.zip");
    let file = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(&zipfile)
        .unwrap();
    let mut archive = zip::ZipWriter::new_append(file).unwrap();
    archive
        .add_symlink("native/worker", "bin/worker", SimpleFileOptions::default())
        .unwrap();
    archive.finish().unwrap();
    base.unpacked_size += "bin/worker".len() as u64;
    let bytes = fs::read(zipfile).unwrap();
    base.size = bytes.len() as u64;
    base.sha256 = hex::encode(Sha256::digest(bytes));
    let (url, key) = catalog(source.path(), vec![base]);
    let snapshot = install(root.path(), &url, &key, &[], |_| {}).unwrap();
    let native = package_path(root.path(), &snapshot.packages["base"]).join("native");
    assert!(native.join("worker").is_symlink());
    assert_eq!(fs::read(native.join("worker")).unwrap(), b"worker");
    assert_eq!(
        fs::metadata(native.join("worker"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o755
    );
}
