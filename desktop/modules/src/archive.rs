use crate::model::safe_path;
use std::{
    collections::BTreeSet,
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
};

fn link_target(path: &Path, target: &str) -> Result<PathBuf, String> {
    if target.contains(['\\', ':', '\0']) || Path::new(target).is_absolute() {
        return Err("ZIP 符号链接目标无效。".into());
    }
    let mut result = path.parent().unwrap_or(Path::new("")).to_path_buf();
    for c in Path::new(target).components() {
        match c {
            Component::Normal(value) => result.push(value),
            Component::CurDir => {}
            Component::ParentDir if result.pop() => {}
            _ => return Err("ZIP 符号链接越出模块目录。".into()),
        }
    }
    Ok(result)
}
pub(crate) fn extract(zip: &Path, destination: &Path, maximum: u64) -> Result<(), String> {
    let file = fs::File::open(zip).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    if archive.len() > 100000 {
        return Err("ZIP 文件数量超限。".into());
    }
    let mut names = BTreeSet::new();
    let mut links = Vec::new();
    let mut expanded = 0u64;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().trim_end_matches('/').to_owned();
        if !safe_path(&name) || !names.insert(name.to_ascii_lowercase()) {
            return Err("ZIP 包含无效或重复路径。".into());
        }
        let expected_size = entry.size();
        expanded = expanded.checked_add(entry.size()).ok_or("ZIP 大小溢出。")?;
        if expanded > maximum {
            return Err("ZIP 解压大小超限。".into());
        }
        let relative = Path::new(&name);
        let out = destination.join(relative);
        let mode = entry.unix_mode().unwrap_or(0o644);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(|e| e.to_string())?;
            continue;
        }
        fs::create_dir_all(out.parent().unwrap()).map_err(|e| e.to_string())?;
        if mode & 0o170000 == 0o120000 {
            if entry.size() > 1024 {
                return Err("ZIP 符号链接过长。".into());
            }
            let mut target = String::new();
            entry
                .read_to_string(&mut target)
                .map_err(|e| e.to_string())?;
            let resolved = link_target(relative, &target)?;
            links.push((relative.to_owned(), target, resolved));
        } else {
            if !matches!(mode & 0o170000, 0 | 0o100000) {
                return Err("ZIP 包含特殊文件。".into());
            }
            let mut file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&out)
                .map_err(|e| e.to_string())?;
            let written = std::io::copy(&mut entry.take(maximum + 1), &mut file)
                .map_err(|e| e.to_string())?;
            if written != expected_size || written > maximum {
                return Err("ZIP 内容超过大小限制。".into());
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(&out, fs::Permissions::from_mode(mode & 0o777))
                    .map_err(|e| e.to_string())?;
            }
        }
    }
    if expanded != maximum {
        return Err("ZIP 解压大小与签名清单不一致。".into());
    }
    // Create links only after regular files; links cannot be extraction parents.
    for (relative, target, _resolved) in &links {
        #[cfg(unix)]
        std::os::unix::fs::symlink(target, destination.join(relative))
            .map_err(|e| e.to_string())?;
        #[cfg(windows)]
        {
            let _ = target;
            let source = destination.join(_resolved);
            if source.is_dir() {
                return Err("Windows ZIP 不能包含目录符号链接。".into());
            }
            fs::copy(source, destination.join(relative)).map_err(|e| e.to_string())?;
        }
    }
    let canonical_root = destination.canonicalize().map_err(|e| e.to_string())?;
    for (relative, _, _) in &links {
        let target = destination
            .join(relative)
            .canonicalize()
            .map_err(|_| "ZIP 符号链接循环或目标缺失。")?;
        if !target.starts_with(&canonical_root) {
            return Err("ZIP 符号链接越出模块目录。".into());
        }
    }
    Ok(())
}
