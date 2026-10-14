use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::{Signer, SigningKey};
use lmbox_modules::{
    install, installed, load_catalog, package_path, read_ui, remove, target, Catalog, Package,
};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{BufRead, BufReader, Write},
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use zip::write::SimpleFileOptions;

fn package(source: &Path, id: &str, dependencies: &[&str], extra: &[(&str, &[u8])]) -> Package {
    versioned_package(source, id, "0.1.1", dependencies, extra)
}
fn versioned_package(
    source: &Path,
    id: &str,
    version: &str,
    dependencies: &[&str],
    extra: &[(&str, &[u8])],
) -> Package {
    let file = format!("{id}.zip");
    let mut archive = zip::ZipWriter::new(fs::File::create(source.join(&file)).unwrap());
    let manifest =
        serde_json::to_vec(&serde_json::json!({"id":id,"version":version,"target":target()}))
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
        version: version.into(),
        kind: if id == "base" {
            "base"
        } else if id == "shared" || id.ends_with("-runtime") {
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
        app_version: packages[0].version.clone(),
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

struct HttpSource {
    url: String,
    requests: Arc<Mutex<Vec<String>>>,
    stop: Arc<AtomicBool>,
    server: Option<std::thread::JoinHandle<()>>,
}
impl HttpSource {
    fn new(source: &Path) -> Self {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        listener.set_nonblocking(true).unwrap();
        let requests = Arc::new(Mutex::new(Vec::new()));
        let records = requests.clone();
        let stop = Arc::new(AtomicBool::new(false));
        let finished = stop.clone();
        let directory = source.to_owned();
        let server = std::thread::spawn(move || {
            while !finished.load(Ordering::Relaxed) {
                let (mut socket, _) = match listener.accept() {
                    Ok(socket) => socket,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(std::time::Duration::from_millis(2));
                        continue;
                    }
                    Err(error) => panic!("HTTP test listener failed: {error}"),
                };
                // Windows accepted streams inherit the listener's nonblocking
                // mode. Requests may also arrive in more than one TCP packet.
                socket.set_nonblocking(false).unwrap();
                socket
                    .set_read_timeout(Some(std::time::Duration::from_secs(5)))
                    .unwrap();
                socket
                    .set_write_timeout(Some(std::time::Duration::from_secs(5)))
                    .unwrap();
                let mut input = BufReader::new(&mut socket);
                let mut request = String::new();
                assert!(input.read_line(&mut request).unwrap() > 0);
                let path = request
                    .split_whitespace()
                    .nth(1)
                    .unwrap()
                    .trim_start_matches('/')
                    .to_owned();
                let mut total = request.len();
                loop {
                    let mut header = String::new();
                    let count = input.read_line(&mut header).unwrap();
                    assert!(count > 0, "incomplete HTTP request");
                    total += count;
                    assert!(total <= 8192, "oversized HTTP request");
                    if header == "\r\n" {
                        break;
                    }
                }
                drop(input);
                records.lock().unwrap().push(path.clone());
                let (status, bytes) = match fs::read(directory.join(path)) {
                    Ok(bytes) => ("200 OK", bytes),
                    Err(_) => ("404 Not Found", Vec::new()),
                };
                write!(
                    socket,
                    "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    bytes.len()
                )
                .unwrap();
                socket.write_all(&bytes).unwrap();
            }
        });
        Self {
            url: format!("http://{address}/catalog.json"),
            requests,
            stop,
            server: Some(server),
        }
    }

    fn take_requests(&self) -> Vec<String> {
        std::mem::take(&mut *self.requests.lock().unwrap())
    }
}
impl Drop for HttpSource {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        let result = self.server.take().unwrap().join();
        if !std::thread::panicking() {
            result.unwrap();
        }
    }
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
    let source = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let base = package(source.path(), "base", &[], &[("ui/index.html", b"base")]);
    let shared = package(source.path(), "ui-runtime", &["base"], &[]);
    let propulsion = package(source.path(), "propulsion-runtime", &["base"], &[]);
    let ai = package(source.path(), "ai-runtime", &["base"], &[]);
    let nozzle = package(
        source.path(),
        "nozzle",
        &["ui-runtime", "propulsion-runtime"],
        &[("ui/nozzle.js", b"nozzle")],
    );
    let agent = package(
        source.path(),
        "agent",
        &["ui-runtime", "ai-runtime"],
        &[("ui/agent.js", b"agent")],
    );
    let cfd = package(source.path(), "cfd", &["ui-runtime"], &[]);
    let (_, key) = catalog(
        source.path(),
        vec![base, shared, propulsion, ai, nozzle, agent, cfd],
    );
    let http = HttpSource::new(source.path());

    let first = install(
        root.path(),
        &http.url,
        &key,
        &["nozzle".into(), "nozzle".into()],
        |_| {},
    )
    .unwrap();
    assert_eq!(
        http.take_requests(),
        vec![
            "catalog.json",
            "base.zip",
            "ui-runtime.zip",
            "propulsion-runtime.zip",
            "nozzle.zip"
        ]
    );
    assert_eq!(
        first
            .packages
            .keys()
            .map(String::as_str)
            .collect::<Vec<_>>(),
        vec!["base", "nozzle", "propulsion-runtime", "ui-runtime"]
    );

    let second = install(root.path(), &http.url, &key, &["agent".into()], |_| {}).unwrap();
    assert!(second.packages.contains_key("nozzle"));
    assert!(second.packages.contains_key("agent"));
    assert!(!second.packages.contains_key("cfd"));
    assert_eq!(
        http.take_requests(),
        vec!["catalog.json", "ai-runtime.zip", "agent.zip"]
    );

    install(root.path(), &http.url, &key, &["agent".into()], |_| {}).unwrap();
    assert_eq!(http.take_requests(), vec!["catalog.json"]);

    let base_only = tempfile::tempdir().unwrap();
    let snapshot = install(base_only.path(), &http.url, &key, &[], |_| {}).unwrap();
    assert_eq!(snapshot.packages.len(), 1);
    assert_eq!(http.take_requests(), vec!["catalog.json", "base.zip"]);

    let before = fs::read(root.path().join("installed.json")).unwrap();
    for invalid in ["injector", "base", "ai-runtime", "unknown"] {
        assert!(install(root.path(), &http.url, &key, &[invalid.into()], |_| {}).is_err());
        assert_eq!(http.take_requests(), vec!["catalog.json"]);
        assert_eq!(
            fs::read(root.path().join("installed.json")).unwrap(),
            before
        );
    }
}

#[test]
fn malformed_dependency_catalogs_never_download_archives() {
    let source = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let base = package(source.path(), "base", &[], &[]);
    let nozzle = package(source.path(), "nozzle", &["base"], &[]);
    let http = HttpSource::new(source.path());
    for mut owner in [
        base.clone(),
        package(source.path(), "ui-runtime", &[], &[]),
        package(source.path(), "agent", &[], &[]),
    ] {
        owner.dependencies.push("nozzle".into());
        let mut packages = vec![nozzle.clone(), owner.clone()];
        if owner.id != "base" {
            packages.push(base.clone());
        }
        let (_, key) = catalog(source.path(), packages);
        assert!(install(root.path(), &http.url, &key, &[], |_| {}).is_err());
        assert_eq!(http.take_requests(), vec!["catalog.json"]);
    }
    // An unused runtime cycle is invalid even when only the base was selected.
    let first = package(source.path(), "first-runtime", &["second-runtime"], &[]);
    let second = package(source.path(), "second-runtime", &["first-runtime"], &[]);
    let (_, key) = catalog(source.path(), vec![base.clone(), first, second]);
    assert!(install(root.path(), &http.url, &key, &[], |_| {}).is_err());
    assert_eq!(http.take_requests(), vec!["catalog.json"]);

    let mut duplicate = nozzle;
    duplicate.file = "BASE.zip".into();
    let (_, key) = catalog(source.path(), vec![base, duplicate]);
    assert!(install(root.path(), &http.url, &key, &[], |_| {}).is_err());
    assert_eq!(http.take_requests(), vec!["catalog.json"]);
    assert!(installed(root.path()).unwrap().packages.is_empty());
}

#[test]
fn release_upgrade_retires_missing_modules_without_downloading_unselected_features() {
    let source = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let base = package(source.path(), "base", &[], &[("ui/index.html", b"old")]);
    let injector = package(
        source.path(),
        "injector",
        &["base"],
        &[("ui/injector.js", b"old")],
    );
    let (_, key) = catalog(source.path(), vec![base.clone(), injector]);
    let http = HttpSource::new(source.path());
    let old = install(root.path(), &http.url, &key, &["injector".into()], |_| {}).unwrap();
    assert_eq!(
        http.take_requests(),
        vec!["catalog.json", "base.zip", "injector.zip"]
    );
    let previous_registry = fs::read(root.path().join("installed.json")).unwrap();

    // The same release cannot silently revoke an installed module.
    catalog(source.path(), vec![base]);
    assert!(install(root.path(), &http.url, &key, &[], |_| {}).is_err());
    assert_eq!(http.take_requests(), vec!["catalog.json"]);
    assert_eq!(
        fs::read(root.path().join("installed.json")).unwrap(),
        previous_registry
    );

    let base = versioned_package(
        source.path(),
        "base",
        "0.1.2",
        &[],
        &[("ui/index.html", b"new")],
    );
    let cfd = versioned_package(source.path(), "cfd", "0.1.2", &["base"], &[]);
    catalog(source.path(), vec![base, cfd]);
    let next = install(root.path(), &http.url, &key, &[], |_| {}).unwrap();
    assert_eq!(http.take_requests(), vec!["catalog.json", "base.zip"]);
    assert_eq!(next.app_version, "0.1.2");
    assert_eq!(next.packages.len(), 1);
    assert!(read_ui(root.path(), &next, "injector.js").is_err());
    assert_eq!(read_ui(root.path(), &old, "injector.js").unwrap(), b"old");
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
