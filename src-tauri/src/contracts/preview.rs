use super::GraphicsIr;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModelSettings {
    pub thickness: f64,
    pub margin: f64,
    pub compensation: f64,
    pub mirror: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreviewRequest {
    pub protocol_version: String,
    pub project_id: String,
    pub job_id: String,
    pub input_revision: u64,
    pub ir: GraphicsIr,
    pub settings: ModelSettings,
}
