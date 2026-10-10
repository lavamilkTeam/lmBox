//! CFD transport identities. Native widget/object state remains a versioned adapter payload.
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CfdOperation {
    Initialize,
    Command,
    Inspect,
    Poll,
    SetField,
    ClickField,
    EditorAccept,
    EditorReject,
    SelectGeometry,
    SelectObject,
    EditObject,
    SetProperty,
    SetVisibility,
    DeleteObject,
    Undo,
    Redo,
    ImportFile,
    ExportDocument,
    DialogResponse,
    Close,
}

impl CfdOperation {
    pub fn is_read_only(self) -> bool {
        matches!(self, Self::Inspect | Self::Poll | Self::ExportDocument)
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CfdRequest {
    pub schema_version: u32,
    pub project_id: String,
    pub request_id: String,
    pub expected_revision: u64,
    pub operation: CfdOperation,
    pub payload: Map<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CfdErrorInfo {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Value>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct CfdArtifact {
    pub name: String,
    pub base64: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CfdResponse {
    pub schema_version: u32,
    pub project_id: String,
    pub request_id: String,
    pub input_revision: u64,
    pub revision: u64,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artifact: Option<CfdArtifact>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<CfdErrorInfo>,
}
