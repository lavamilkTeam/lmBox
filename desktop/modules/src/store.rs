use crate::{archive, catalog, model::safe_path, Catalog, Package, Progress, Snapshot};
use fs2::FileExt;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};
use url::Url;

pub fn default_root() -> Result<PathBuf, String> {
    if let Some(root) = std::env::var_os("LMBOX_INSTALL_ROOT") {
        return Ok(PathBuf::from(root));
    }
    dirs::data_local_dir()
        .map(|p| p.join("lmBox"))
        .ok_or_else(|| "无法定位模块安装目录。".into())
}
pub fn installed(root: &Path) -> Result<Snapshot, String> {
    let path = root.join("installed.json");
    if !path.exists() {
        return Ok(Snapshot::default());
    }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    if bytes.len() > 4 * 1024 * 1024 {
        return Err("模块安装记录过大。".into());
    }
    let snapshot: Snapshot = serde_json::from_slice(&bytes).map_err(|_| "模块安装记录损坏。")?;
    Catalog {
        schema_version: snapshot.schema_version,
        app_version: snapshot.app_version.clone(),
        target: snapshot.target.clone(),
        packages: snapshot.packages.values().cloned().collect(),
    }
    .validate()?;
    Ok(snapshot)
}
pub fn package_path(root: &Path, package: &Package) -> PathBuf {
    root.join("packages").join(format!(
        "{}-{}-{}",
        package.id,
        package.version,
        &package.sha256[..16]
    ))
}
fn visit(
    id: &str,
    catalog: &Catalog,
    visiting: &mut BTreeSet<String>,
    done: &mut BTreeSet<String>,
    order: &mut Vec<String>,
) -> Result<(), String> {
    if done.contains(id) {
        return Ok(());
    }
    if !visiting.insert(id.to_owned()) {
        return Err("模块依赖存在循环。".into());
    }
    let package = catalog
        .packages
        .iter()
        .find(|p| p.id == id)
        .ok_or_else(|| format!("模块未发布：{id}"))?;
    for dependency in &package.dependencies {
        visit(dependency, catalog, visiting, done, order)?;
    }
    visiting.remove(id);
    done.insert(id.to_owned());
    order.push(id.to_owned());
    Ok(())
}
pub fn install(
    root: &Path,
    catalog_url: &str,
    key: &[u8; 32],
    selected: &[String],
    mut progress: impl FnMut(Progress<'_>),
) -> Result<Snapshot, String> {
    let catalog = catalog::load_catalog(catalog_url, key)?;
    if selected.iter().any(|id| {
        !catalog
            .packages
            .iter()
            .any(|p| &p.id == id && p.kind == "module")
    }) {
        return Err("所选功能模块尚未发布。".into());
    }
    fs::create_dir_all(root.join("packages")).map_err(|e| e.to_string())?;
    let lock = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(root.join("install.lock"))
        .map_err(|e| e.to_string())?;
    lock.try_lock_exclusive()
        .map_err(|_| "另一个安装任务正在运行。")?;
    let old = installed(root)?;
    let mut wanted = selected.to_vec();
    wanted.extend(
        old.packages
            .values()
            .filter(|p| p.kind == "module")
            .map(|p| p.id.clone()),
    );
    wanted.push("base".into());
    let (mut visiting, mut done, mut order) = (BTreeSet::new(), BTreeSet::new(), Vec::new());
    for id in wanted {
        visit(&id, &catalog, &mut visiting, &mut done, &mut order)?;
    }
    let base = Url::parse(catalog_url).map_err(|_| "模块清单地址无效。")?;
    let transaction = tempfile::Builder::new()
        .prefix(".install-")
        .tempdir_in(root)
        .map_err(|e| e.to_string())?;
    let mut next = Snapshot {
        schema_version: 1,
        app_version: catalog.app_version.clone(),
        target: catalog.target.clone(),
        packages: Default::default(),
    };
    for id in order {
        let p = catalog.packages.iter().find(|p| p.id == id).unwrap();
        let destination = package_path(root, p);
        let reusable = fs::read_to_string(destination.join(".verified-sha256"))
            .is_ok_and(|hash| hash == p.sha256);
        if !reusable {
            progress(Progress {
                phase: "download",
                package: &id,
                completed: 0,
                total: p.size,
            });
            let archive_path = transaction.path().join(format!("{id}.zip"));
            let mut file = fs::File::create(&archive_path).map_err(|e| e.to_string())?;
            let mut source = catalog::source(&base.join(&p.file).map_err(|e| e.to_string())?)?;
            let mut hasher = Sha256::new();
            let mut total = 0u64;
            let mut buffer = [0u8; 64 * 1024];
            loop {
                let count = source.read(&mut buffer).map_err(|e| e.to_string())?;
                if count == 0 {
                    break;
                }
                total += count as u64;
                if total > p.size {
                    return Err("下载内容超过签名清单大小。".into());
                }
                hasher.update(&buffer[..count]);
                file.write_all(&buffer[..count])
                    .map_err(|e| e.to_string())?;
                progress(Progress {
                    phase: "download",
                    package: &id,
                    completed: total,
                    total: p.size,
                });
            }
            if total != p.size || hex::encode(hasher.finalize()) != p.sha256 {
                return Err(format!("模块 {id} 下载校验失败。"));
            }
            file.sync_all().map_err(|e| e.to_string())?;
            drop(file);
            progress(Progress {
                phase: "extract",
                package: &id,
                completed: 0,
                total: p.unpacked_size,
            });
            let stage = transaction.path().join(&id);
            fs::create_dir(&stage).map_err(|e| e.to_string())?;
            archive::extract(&archive_path, &stage, p.unpacked_size)?;
            let manifest: serde_json::Value = serde_json::from_slice(
                &fs::read(stage.join("package.json")).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
            if manifest["id"] != p.id
                || manifest["version"] != p.version
                || manifest["target"] != catalog.target
            {
                return Err("ZIP 包身份与签名清单不一致。".into());
            }
            for path in &p.ui_files {
                if !stage.join("ui").join(path).is_file() {
                    return Err("模块界面资源不完整。".into());
                }
            }
            if destination.exists() {
                // Never overwrite a version directory used by a running application.
                return Err("发现未登记的同版本模块目录，请先检查安装目录。".into());
            }
            fs::write(stage.join(".verified-sha256"), &p.sha256).map_err(|e| e.to_string())?;
            fs::rename(stage, destination).map_err(|e| e.to_string())?;
        }
        next.packages.insert(id, p.clone());
    }
    let mut registry = tempfile::NamedTempFile::new_in(root).map_err(|e| e.to_string())?;
    registry
        .write_all(&serde_json::to_vec(&next).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    registry.as_file().sync_all().map_err(|e| e.to_string())?;
    registry
        .persist(root.join("installed.json"))
        .map_err(|e| e.to_string())?;
    if crate::cfd::configure(root, &next, None).is_err() {
        progress(Progress {
            phase: "runtime-required",
            package: "cfd",
            completed: 0,
            total: 1,
        });
    }
    progress(Progress {
        phase: "complete",
        package: "",
        completed: 1,
        total: 1,
    });
    Ok(next)
}
pub fn read_ui(root: &Path, snapshot: &Snapshot, path: &str) -> Result<Vec<u8>, String> {
    if !safe_path(path) {
        return Err("资源路径无效。".into());
    }
    let p = snapshot
        .packages
        .values()
        .find(|p| p.ui_files.iter().any(|file| file == path))
        .ok_or("模块资源尚未安装。")?;
    let directory = package_path(root, p).join("ui");
    let file = directory
        .join(path)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !file.starts_with(directory.canonicalize().map_err(|e| e.to_string())?) {
        return Err("资源越出模块目录。".into());
    }
    fs::read(file).map_err(|e| e.to_string())
}

/// Remove module registrations; immutable payloads remain for running snapshots.
pub fn remove(root: &Path, selected: &[String]) -> Result<Snapshot, String> {
    let lock = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(root.join("install.lock"))
        .map_err(|e| e.to_string())?;
    lock.try_lock_exclusive()
        .map_err(|_| "另一个安装任务正在运行。")?;
    let mut snapshot = installed(root)?;
    if selected.iter().any(|id| {
        !snapshot
            .packages
            .get(id)
            .is_some_and(|p| p.kind == "module")
    }) {
        return Err("卸载选项必须是已安装的功能模块。".into());
    }
    let catalog = Catalog {
        schema_version: 1,
        app_version: snapshot.app_version.clone(),
        target: snapshot.target.clone(),
        packages: snapshot.packages.values().cloned().collect(),
    };
    let mut keep = BTreeSet::new();
    let mut visiting = BTreeSet::new();
    let mut order = Vec::new();
    visit("base", &catalog, &mut visiting, &mut keep, &mut order)?;
    for p in snapshot
        .packages
        .values()
        .filter(|p| p.kind == "module" && !selected.contains(&p.id))
    {
        visit(&p.id, &catalog, &mut visiting, &mut keep, &mut order)?;
    }
    snapshot.packages.retain(|id, _| keep.contains(id));
    let mut registry = tempfile::NamedTempFile::new_in(root).map_err(|e| e.to_string())?;
    registry
        .write_all(&serde_json::to_vec(&snapshot).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    registry.as_file().sync_all().map_err(|e| e.to_string())?;
    registry
        .persist(root.join("installed.json"))
        .map_err(|e| e.to_string())?;
    Ok(snapshot)
}
