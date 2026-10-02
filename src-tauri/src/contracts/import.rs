//! Browser/native import response, defined by schemas/v1/import.schema.json.
use super::GraphicsIr;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub protocol_version: String,
    pub layers: Vec<ImportedLayer>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedLayer {
    pub name: String,
    pub size: usize,
    pub role: LayerRole,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ir: Option<GraphicsIr>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diagnostic: Option<LayerDiagnostic>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum LayerRole {
    TopPaste,
    BottomPaste,
    Outline,
    Other,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LayerDiagnostic {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<usize>,
}
