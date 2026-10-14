use super::super::runtime::{failure, WorkerError, MAX_FRAME};
use crate::contracts::cfd::{CfdOperation, CfdRequest};
use serde_json::Value;

pub(super) const MAX_FILE_BASE64: usize = 32 * 1024 * 1024;

pub(super) fn validate(request: &CfdRequest) -> Result<(), WorkerError> {
    if request.expected_revision > 9_007_199_254_740_991 {
        return Err(failure(
            "invalid_revision",
            "工程版本超出可精确传输的整数范围。",
        ));
    }
    if request.schema_version != 1 {
        return Err(failure("unsupported_version", "不支持此 CFD 协议版本。"));
    }
    for id in [&request.project_id, &request.request_id] {
        if id.is_empty()
            || id.len() > 128
            || !id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"-_".contains(&c))
        {
            return Err(failure(
                "invalid_identity",
                "工程与请求标识须为 1–128 个字母、数字或 -_。",
            ));
        }
    }
    if serde_json::to_vec(request).map_or(true, |v| v.len() > MAX_FRAME) {
        return Err(failure("request_too_large", "CFD 请求超过 36 MiB。"));
    }
    use CfdOperation::*;
    let keys: &[&str] = match request.operation {
        Initialize | Inspect | Poll | EditorAccept | EditorReject | ExportDocument | Close
        | Undo | Redo => &[],
        Command => &["commandId"],
        SetField => &["fieldId", "value"],
        ClickField => &["fieldId"],
        SelectGeometry => &["objectId", "subelements"],
        SelectObject | EditObject | DeleteObject => &["objectId"],
        SetVisibility => &["objectId", "visible"],
        SetProperty => &["objectId", "name", "value"],
        ImportFile => &["name", "base64"],
        DialogResponse => &["dialogId", "buttonId"],
    };
    let optional_child =
        request.operation == Command && request.payload.contains_key("childCommandId");
    let optional_phase = request.operation == SetField && request.payload.contains_key("phase");
    let optional_append = matches!(request.operation, SelectObject | SelectGeometry)
        && request.payload.contains_key("append");
    if request.payload.len()
        != keys.len()
            + usize::from(optional_child)
            + usize::from(optional_phase)
            + usize::from(optional_append)
        || keys.iter().any(|key| !request.payload.contains_key(*key))
    {
        return Err(failure(
            "invalid_payload",
            "CFD 操作参数不匹配；不接受路径、源码或可执行文件参数。",
        ));
    }
    if optional_append && !request.payload["append"].is_boolean() {
        return Err(failure("invalid_payload", "append 必须是布尔值。"));
    }
    for key in keys
        .iter()
        .filter(|key| !["value", "visible", "subelements", "base64"].contains(key))
    {
        let value = request.payload[*key]
            .as_str()
            .ok_or_else(|| failure("invalid_payload", format!("{key} 必须是字符串。")))?;
        if value.is_empty() || value.len() > 512 || value.chars().any(char::is_control) {
            return Err(failure("invalid_payload", format!("{key} 无效。")));
        }
    }
    if optional_phase
        && !request.payload["phase"]
            .as_str()
            .is_some_and(|phase| ["input", "commit"].contains(&phase))
    {
        return Err(failure(
            "invalid_payload",
            "控件事件阶段必须为 input 或 commit。",
        ));
    }
    if optional_child
        && !request.payload["childCommandId"]
            .as_str()
            .is_some_and(|value| {
                !value.is_empty()
                    && value.len() <= 128
                    && value
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || c == b'_')
            })
    {
        return Err(failure("invalid_payload", "分组命令标识无效。"));
    }
    if request.operation == SetVisibility && !request.payload["visible"].is_boolean() {
        return Err(failure("invalid_payload", "visible 必须是布尔值。"));
    }
    if request.operation == SelectGeometry {
        let valid = request.payload["subelements"]
            .as_array()
            .is_some_and(|items| {
                items.len() <= 10000
                    && items.iter().all(|item| {
                        item.as_str().is_some_and(|value| {
                            value.len() <= 128
                                && value
                                    .bytes()
                                    .all(|c| c.is_ascii_alphanumeric() || c == b'_')
                        })
                    })
            });
        if !valid {
            return Err(failure("invalid_payload", "几何子元素列表无效。"));
        }
    }
    if request.operation == ImportFile {
        let name = request.payload["name"].as_str().unwrap();
        let extension = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
        if name.len() > 200
            || name.starts_with('.')
            || name.contains(['/', '\\', ':'])
            || !["step", "stp", "iges", "igs", "brep", "stl", "obj", "fcstd"]
                .contains(&extension.as_str())
        {
            return Err(failure(
                "invalid_file",
                "仅接受 STEP、IGES、BREP、STL、OBJ 或 FCStd 文件名。",
            ));
        }
        if !request.payload["base64"]
            .as_str()
            .is_some_and(|value| !value.is_empty() && value.len() <= MAX_FILE_BASE64)
        {
            return Err(failure(
                "import_too_large",
                "导入文件的 Base64 内容不得超过 32 MiB（文件 24 MiB）。",
            ));
        }
    }
    Ok(())
}

pub(super) fn decode_base64(value: &str) -> Result<Vec<u8>, WorkerError> {
    let invalid = || failure("invalid_file", "文件 Base64 编码无效。");
    if !value.len().is_multiple_of(4) {
        return Err(invalid());
    }
    let mut output = Vec::with_capacity(value.len() / 4 * 3);
    for (index, chunk) in value.as_bytes().chunks_exact(4).enumerate() {
        let mut bits = 0_u32;
        let mut padding = 0;
        for (position, byte) in chunk.iter().enumerate() {
            let digit = match byte {
                b'A'..=b'Z' if padding == 0 => byte - b'A',
                b'a'..=b'z' if padding == 0 => byte - b'a' + 26,
                b'0'..=b'9' if padding == 0 => byte - b'0' + 52,
                b'+' if padding == 0 => 62,
                b'/' if padding == 0 => 63,
                b'=' if position >= 2 && index + 1 == value.len() / 4 => {
                    padding += 1;
                    0
                }
                _ => return Err(invalid()),
            };
            bits = (bits << 6) | u32::from(digit);
        }
        if (padding == 2 && bits & 0xffff != 0) || (padding == 1 && bits & 0xff != 0) {
            return Err(invalid());
        }
        output.push((bits >> 16) as u8);
        if padding < 2 {
            output.push((bits >> 8) as u8);
        }
        if padding == 0 {
            output.push(bits as u8);
        }
    }
    Ok(output)
}

pub(super) fn encode_base64(value: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(value.len().div_ceil(3) * 4);
    for chunk in value.chunks(3) {
        let bits = (u32::from(chunk[0]) << 16)
            | (u32::from(*chunk.get(1).unwrap_or(&0)) << 8)
            | u32::from(*chunk.get(2).unwrap_or(&0));
        output.push(TABLE[((bits >> 18) & 63) as usize] as char);
        output.push(TABLE[((bits >> 12) & 63) as usize] as char);
        output.push(if chunk.len() > 1 {
            TABLE[((bits >> 6) & 63) as usize] as char
        } else {
            '='
        });
        output.push(if chunk.len() > 2 {
            TABLE[(bits & 63) as usize] as char
        } else {
            '='
        });
    }
    output
}

pub(super) fn worker_error(value: Option<&Value>) -> WorkerError {
    if let Some(Value::Object(error)) = value {
        return WorkerError {
            code: error
                .get("code")
                .and_then(Value::as_str)
                .unwrap_or("native_error")
                .into(),
            message: error
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("CFD 原生操作失败。")
                .into(),
            details: error.get("details").cloned(),
        };
    }
    failure(
        "native_error",
        value
            .and_then(Value::as_str)
            .unwrap_or("CFD 原生操作失败。"),
    )
}
