use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Package {
    pub id: String,
    pub version: String,
    pub kind: String,
    pub file: String,
    pub sha256: String,
    pub size: u64,
    pub unpacked_size: u64,
    pub dependencies: Vec<String>,
    pub ui_files: Vec<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Catalog {
    pub schema_version: u32,
    pub app_version: String,
    pub target: String,
    pub packages: Vec<Package>,
}
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snapshot {
    pub schema_version: u32,
    pub app_version: String,
    pub target: String,
    pub packages: BTreeMap<String, Package>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress<'a> {
    pub phase: &'a str,
    pub package: &'a str,
    pub completed: u64,
    pub total: u64,
}

pub(crate) fn safe_segment(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 100
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"-._".contains(&c))
        && value != "."
        && value != ".."
}
pub(crate) fn safe_path(value: &str) -> bool {
    !value.is_empty()
        && value.len() < 1024
        && !value.contains(['\\', ':', '\0'])
        && value.split('/').all(|segment| {
            !segment.is_empty()
                && segment.len() <= 255
                && segment != "."
                && segment != ".."
                && !segment.ends_with([' ', '.'])
                && !segment
                    .chars()
                    .any(|c| c.is_control() || "<>\"|?*".contains(c))
        })
}
impl Catalog {
    pub(crate) fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1
            || self.target != super::target()
            || !safe_segment(&self.app_version)
        {
            return Err("模块清单版本或系统架构不匹配。".into());
        }
        if self.packages.is_empty() || self.packages.len() > 64 {
            return Err("模块清单数量无效。".into());
        }
        let mut ids = std::collections::BTreeSet::new();
        let mut assets = std::collections::BTreeSet::new();
        for p in &self.packages {
            if !safe_segment(&p.id)
                || p.version != self.app_version
                || !safe_segment(&p.file)
                || !p.file.ends_with(".zip")
                || !matches!(p.kind.as_str(), "base" | "module" | "runtime")
                || p.sha256.len() != 64
                || hex::decode(&p.sha256).is_err()
                || p.size == 0
                || p.size > 4 * 1024 * 1024 * 1024
                || p.unpacked_size == 0
                || p.unpacked_size > 12 * 1024 * 1024 * 1024
                || p.dependencies.len() > 64
                || p.ui_files.len() > 20000
                || !ids.insert(&p.id)
            {
                return Err("模块包描述无效或重复。".into());
            }
            for asset in &p.ui_files {
                if !safe_path(asset) || !assets.insert(asset) {
                    return Err("界面资源路径无效或重复。".into());
                }
            }
        }
        if !self
            .packages
            .iter()
            .any(|p| p.id == "base" && p.kind == "base")
        {
            return Err("缺少基础程序包。".into());
        }
        for p in &self.packages {
            if p.dependencies
                .iter()
                .any(|d| !ids.contains(d) || d == &p.id)
            {
                return Err("模块依赖缺失或无效。".into());
            }
        }
        Ok(())
    }
}
