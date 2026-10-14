use std::collections::HashSet;
use std::io::{Cursor, Read};

use super::parse_gerber;
use crate::contracts::{ImportResult, ImportedLayer, LayerDiagnostic, LayerRole};

const MAX_SOURCE: usize = 30 * 1024 * 1024;
const MAX_EXPANDED: u64 = 150 * 1024 * 1024;
const MAX_FILES: usize = 500;

fn role(name: &str) -> LayerRole {
    let name = name.to_ascii_lowercase().replace(['-', '_', '.'], "");
    if name.ends_with("gtp") || name.contains("toppaste") || name.contains("fpaste") {
        LayerRole::TopPaste
    } else if name.ends_with("gbp") || name.contains("bottompaste") || name.contains("bpaste") {
        LayerRole::BottomPaste
    } else if name.ends_with("gko")
        || name.ends_with("gm1")
        || name.contains("outline")
        || name.contains("edgecuts")
    {
        LayerRole::Outline
    } else {
        LayerRole::Other
    }
}

fn gerber_name(name: &str) -> bool {
    let ext = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    matches!(
        ext.as_str(),
        "gtp"
            | "gbp"
            | "gko"
            | "gm1"
            | "gbr"
            | "ger"
            | "gbl"
            | "gtl"
            | "gts"
            | "gbs"
            | "gto"
            | "gbo"
    )
}

fn layer(name: String, bytes: &[u8]) -> ImportedLayer {
    let mut layer = ImportedLayer {
        role: role(&name),
        name,
        size: bytes.len(),
        ir: None,
        diagnostic: None,
    };
    if !gerber_name(&layer.name) {
        layer.diagnostic = Some(LayerDiagnostic {
            code: "unsupported_format".into(),
            message: "该文件格式暂不支持预览。".into(),
            line: None,
        });
        return layer;
    }
    let source = match std::str::from_utf8(bytes) {
        Ok(source) => source.trim_start_matches('\u{feff}'),
        Err(_) => {
            layer.diagnostic = Some(LayerDiagnostic {
                code: "invalid_encoding".into(),
                message: "文件不是有效的 UTF-8 Gerber 文本。".into(),
                line: None,
            });
            return layer;
        }
    };
    match parse_gerber(source) {
        Ok(ir) if !ir.objects.is_empty() => layer.ir = Some(ir),
        Ok(_) => {
            layer.diagnostic = Some(LayerDiagnostic {
                code: "empty_geometry".into(),
                message: "文件没有可显示的图形。".into(),
                line: None,
            })
        }
        Err(error) => {
            layer.diagnostic = Some(LayerDiagnostic {
                code: "parse_error".into(),
                message: format!("无法解析：{}", error.message),
                line: Some(
                    source
                        .chars()
                        .take(error.offset)
                        .filter(|c| *c == '\n')
                        .count()
                        + 1,
                ),
            })
        }
    }
    layer
}

/// Import controlled in-memory bytes. No filesystem or process access is
/// needed: the desktop and browser adapters can share this public behavior.
pub fn import_board(name: &str, bytes: &[u8]) -> Result<ImportResult, String> {
    if bytes.len() > MAX_SOURCE {
        return Err("文件超过 30 MB，请选择较小的文件。".into());
    }
    if !name.to_ascii_lowercase().ends_with(".zip") {
        return Ok(ImportResult {
            protocol_version: "1".into(),
            layers: vec![layer(name.into(), bytes)],
        });
    }
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|_| "无法读取 ZIP，请检查压缩包是否完整。")?;
    if zip.len() > MAX_FILES {
        return Err("压缩包文件数量超过 500。".into());
    }
    let mut names = HashSet::new();
    let mut expanded = 0u64;
    let mut layers = Vec::new();
    for i in 0..zip.len() {
        let mut file = zip.by_index(i).map_err(|_| "无法读取压缩包条目。")?;
        let name = file.name().replace('\\', "/");
        if name.starts_with('/')
            || name.contains(':')
            || name.split('/').any(|part| part == "..")
            || file
                .unix_mode()
                .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err("压缩包包含不安全的路径或链接。".into());
        }
        if !names.insert(name.clone()) {
            return Err("压缩包包含重复文件名。".into());
        }
        expanded = expanded.checked_add(file.size()).ok_or("压缩包过大。")?;
        if expanded > MAX_EXPANDED || file.size() > MAX_SOURCE as u64 {
            return Err("压缩包展开后超出大小限制。".into());
        }
        if file.is_dir() || name.starts_with("__MACOSX/") {
            continue;
        }
        let mut bytes = Vec::new();
        (&mut file)
            .take(MAX_SOURCE as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "压缩包内容损坏或校验失败。")?;
        if bytes.len() > MAX_SOURCE || bytes.len() as u64 != file.size() {
            return Err("压缩包条目大小不符合声明。".into());
        }
        layers.push(layer(name, &bytes));
    }
    if layers.is_empty() {
        return Err("压缩包为空。".into());
    }
    Ok(ImportResult {
        protocol_version: "1".into(),
        layers,
    })
}
