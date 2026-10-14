//! lmBox AI v1 transport. Vendor objects never cross this boundary.
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum AiCapability {
    Video,
    Agent,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AiOperation {
    Inspect,
    Start,
    Status,
    Cancel,
    Artifact,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiRequest {
    pub schema_version: u32,
    pub project_id: String,
    pub request_id: String,
    pub input_revision: u64,
    pub capability: AiCapability,
    pub operation: AiOperation,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub job_id: Option<String>,
    #[serde(default)]
    pub payload: Map<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiError {
    pub code: String,
    pub message: String,
}

impl AiError {
    pub fn new(code: &str, message: &str) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiArtifact {
    pub id: String,
    pub name: String,
    pub mime_type: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiResult {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    pub artifacts: Vec<AiArtifact>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AiEvent {
    pub message: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AiStatus {
    Running,
    Succeeded,
    Failed,
    Cancelled,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiJob {
    pub job_id: String,
    pub capability: AiCapability,
    pub input_revision: u64,
    pub status: AiStatus,
    pub events: Vec<AiEvent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<AiResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<AiError>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiResponse {
    pub schema_version: u32,
    pub project_id: String,
    pub request_id: String,
    pub input_revision: u64,
    pub capability: AiCapability,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<AiError>,
}

impl AiResponse {
    pub fn for_request(request: &AiRequest, result: Result<Value, AiError>) -> Self {
        let (ok, data, error) = match result {
            Ok(data) => (true, Some(data), None),
            Err(error) => (false, None, Some(error)),
        };
        Self {
            schema_version: 1,
            project_id: request.project_id.clone(),
            request_id: request.request_id.clone(),
            input_revision: request.input_revision,
            capability: request.capability,
            ok,
            data,
            error,
        }
    }
}
