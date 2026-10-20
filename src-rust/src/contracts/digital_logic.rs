//! Wire types for the versioned digital logic session protocol.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum LogicSignal {
    #[serde(rename = "0")]
    Zero,
    #[serde(rename = "1")]
    One,
    #[serde(rename = "X")]
    Unknown,
    #[serde(rename = "Z")]
    HighImpedance,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LogicNodeKind {
    And,
    Or,
    Not,
    Nand,
    Nor,
    Xor,
    Xnor,
    Buf,
    Input,
    Clock,
    Dff,
    Probe,
    Hd44780,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LogicNode {
    pub id: String,
    pub kind: LogicNodeKind,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LogicEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub target_port: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum LogicCommand {
    Load {
        nodes: Vec<LogicNode>,
        edges: Vec<LogicEdge>,
        values: BTreeMap<String, LogicSignal>,
    },
    SetInput {
        node_id: String,
        value: LogicSignal,
    },
    Step {
        ticks: u32,
    },
    Reset {},
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LogicRequest {
    pub schema_version: u32,
    pub project_id: String,
    pub request_id: String,
    pub input_revision: u64,
    pub command: LogicCommand,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LogicDisplay {
    pub rows: [String; 2],
    pub cursor: Option<u32>,
    pub display_on: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LogicDiagnostic {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_id: Option<String>,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LogicResponse {
    pub schema_version: u32,
    pub project_id: String,
    pub request_id: String,
    pub input_revision: u64,
    pub tick: u64,
    pub outputs: BTreeMap<String, LogicSignal>,
    pub inputs: BTreeMap<String, BTreeMap<String, LogicSignal>>,
    pub displays: BTreeMap<String, LogicDisplay>,
    pub diagnostics: Vec<LogicDiagnostic>,
}
