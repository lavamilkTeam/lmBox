//! Host-owned, bounded text tools. The model never supplies a filesystem path.
use super::arithmetic;
use crate::contracts::ai::{AiError, AiRequest};
use serde_json::{json, Map, Value};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::Write,
    path::Path,
};

const FILE_LIMIT: usize = 1024 * 1024;
const TOTAL_LIMIT: usize = 8 * FILE_LIMIT;
const NAMES: [&str; 5] = [
    "calculate",
    "list_files",
    "read_file",
    "write_file",
    "workspace_info",
];

pub(super) struct Tools {
    files: BTreeMap<String, String>,
    written: BTreeSet<String>,
    identity: Value,
}

impl Tools {
    pub(super) fn new(request: &AiRequest) -> Result<Self, AiError> {
        let mut tools = Self {
            files: BTreeMap::new(),
            written: BTreeSet::new(),
            identity: json!({"projectId": request.project_id, "inputRevision": request.input_revision,
                "capability": request.capability, "tools": NAMES}),
        };
        if let Some(value) = request.payload.get("files") {
            let attachments = value
                .as_array()
                .filter(|files| files.len() <= 16)
                .ok_or_else(|| AiError::new("invalid_request", "Agent 最多接收 16 个文本附件。"))?;
            let mut total = 0;
            for attachment in attachments {
                let item = attachment.as_object().ok_or_else(invalid)?;
                fields(item, &["name", "content"])?;
                let name = string(item, "name")?;
                let content = string(item, "content")?;
                total += content.len();
                if total > FILE_LIMIT {
                    return Err(limit());
                }
                if tools.files.contains_key(name) {
                    return Err(AiError::new("invalid_request", "文本附件名称必须唯一。"));
                }
                tools.write(name, content)?;
            }
            tools.written.clear();
        }
        Ok(tools)
    }

    pub(super) fn invoke(&mut self, name: &str, arguments: &Value) -> Value {
        match self.execute(name, arguments) {
            Ok(value) => json!({"ok": true, "result": value}),
            Err(error) => json!({"ok": false, "error": error}),
        }
    }

    fn execute(&mut self, name: &str, arguments: &Value) -> Result<Value, AiError> {
        let args = arguments.as_object().ok_or_else(invalid)?;
        match name {
            "calculate" => {
                fields(args, &["expression"])?;
                arithmetic::calculate(string(args, "expression")?).map(|number| json!(number))
            }
            "list_files" => {
                fields(args, &[])?;
                Ok(json!(self.files.keys().collect::<Vec<_>>()))
            }
            "read_file" => {
                fields(args, &["name"])?;
                let name = string(args, "name")?;
                validate_name(name)?;
                self.files
                    .get(name)
                    .map(|text| json!(text))
                    .ok_or_else(|| AiError::new("file_unavailable", "请求的文本文件不可用。"))
            }
            "write_file" => {
                fields(args, &["name", "content"])?;
                self.write(string(args, "name")?, string(args, "content")?)
            }
            "workspace_info" => {
                fields(args, &[])?;
                Ok(self.identity.clone())
            }
            _ => Err(AiError::new("invalid_tool_input", "请求的工具不可用。")),
        }
    }

    fn write(&mut self, name: &str, content: &str) -> Result<Value, AiError> {
        validate_name(name)?;
        let bytes = content.len();
        if bytes > FILE_LIMIT
            || (!self.files.contains_key(name) && self.files.len() >= 64)
            || self
                .files
                .iter()
                .filter(|(key, _)| key.as_str() != name)
                .map(|(_, text)| text.len())
                .sum::<usize>()
                + bytes
                > TOTAL_LIMIT
        {
            return Err(limit());
        }
        self.files.insert(name.into(), content.into());
        self.written.insert(name.into());
        Ok(json!({"name": name, "bytes": bytes}))
    }

    pub(super) fn finish(&self, workspace: &Path, mut data: Value) -> Result<Value, AiError> {
        // Node computes the answer; only Rust may register artifact bytes.
        let Some(artifacts) = data.get("artifacts").and_then(Value::as_array) else {
            return Err(AiError::new("worker_protocol", "Agent 产物响应格式无效。"));
        };
        if !artifacts.is_empty() {
            return Err(AiError::new("worker_protocol", "Agent 不可自行注册产物。"));
        }
        let mut records = Vec::new();
        if !self.written.is_empty() {
            let directory = workspace.join("artifacts");
            std::fs::create_dir(&directory).map_err(|_| artifact_error())?;
            for (index, name) in self.written.iter().enumerate() {
                let id = format!("agent-{}.txt", index + 1);
                let mut file = std::fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(directory.join(&id))
                    .map_err(|_| artifact_error())?;
                file.write_all(self.files[name].as_bytes())
                    .map_err(|_| artifact_error())?;
                records.push(json!({"id": id, "name": name, "mimeType": "text/plain"}));
            }
        }
        data["artifacts"] = json!(records);
        Ok(data)
    }
}

fn fields(args: &Map<String, Value>, names: &[&str]) -> Result<(), AiError> {
    if args.len() == names.len() && names.iter().all(|name| args.contains_key(*name)) {
        Ok(())
    } else {
        Err(invalid())
    }
}
fn string<'a>(args: &'a Map<String, Value>, key: &str) -> Result<&'a str, AiError> {
    args.get(key).and_then(Value::as_str).ok_or_else(invalid)
}
fn validate_name(name: &str) -> Result<(), AiError> {
    if name.is_empty()
        || name.chars().count() > 255
        || name.contains("..")
        || name.ends_with([' ', '.'])
        || !name
            .chars()
            .next()
            .is_some_and(|c| c.is_alphanumeric() || c == '_')
        || !name
            .chars()
            .all(|c| c.is_alphanumeric() || matches!(c, '_' | ' ' | '.' | '-'))
    {
        Err(AiError::new(
            "invalid_tool_input",
            "请使用不含目录路径的简单文件名。",
        ))
    } else {
        Ok(())
    }
}
fn invalid() -> AiError {
    AiError::new("invalid_tool_input", "工具参数不符合约定。")
}
fn limit() -> AiError {
    AiError::new("file_limit", "文本文件超过任务大小或数量限制。")
}
fn artifact_error() -> AiError {
    AiError::new("artifact_unavailable", "无法保存任务产物。")
}
