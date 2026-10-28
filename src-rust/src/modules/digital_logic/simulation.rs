use super::circuit::{binary, has_output, ports, valid_id, Circuit, MAX_SAFE_INTEGER};
use super::lcd::Lcd;
use crate::contracts::{
    LogicCommand, LogicDiagnostic, LogicNodeKind as Kind, LogicRequest, LogicResponse,
    LogicSignal as Signal,
};
use std::collections::BTreeMap;

const MAX_TICKS: u32 = 1000;
const MAX_DELTA_ROUNDS: usize = 1024;
const MAX_EVALUATIONS: usize = 2_000_000;

/// An isolated in-memory circuit session. Failed requests leave it unchanged.
#[derive(Default)]
pub struct Simulator {
    session: Option<Session>,
}

#[derive(Clone)]
struct Session {
    project_id: String,
    revision: u64,
    circuit: Circuit,
    outputs: Vec<Signal>,
    previous_clocks: Vec<Signal>,
    displays: BTreeMap<usize, Lcd>,
    tick: u64,
}

impl Simulator {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn request(&mut self, request: LogicRequest) -> Result<LogicResponse, String> {
        if request.schema_version != 1 {
            return Err("不支持的数字逻辑协议版本".into());
        }
        if !valid_id(&request.project_id) || !valid_id(&request.request_id) {
            return Err("工程或请求标识无效".into());
        }
        if request.input_revision > MAX_SAFE_INTEGER {
            return Err("输入版本超过安全整数范围".into());
        }
        if let Some(session) = &self.session {
            if session.project_id != request.project_id {
                return Err("请求不属于当前工程".into());
            }
            if request.input_revision < session.revision {
                return Err("输入版本已过期".into());
            }
        }
        let mut next = if let LogicCommand::Load {
            nodes,
            edges,
            values,
        } = &request.command
        {
            Session::new(
                request.project_id.clone(),
                Circuit::build(nodes, edges, values)?,
            )
        } else {
            self.session.clone().ok_or("请先加载电路")?
        };
        let mut budget = MAX_EVALUATIONS;
        match &request.command {
            LogicCommand::Load { .. } => {}
            LogicCommand::SetInput { node_id, value } => {
                if !matches!(value, Signal::Zero | Signal::One) {
                    return Err("输入开关仅接受 0 或 1".into());
                }
                let index = next
                    .circuit
                    .nodes
                    .iter()
                    .position(|node| node.id == *node_id && node.kind == Kind::Input)
                    .ok_or("输入源不存在")?;
                next.outputs[index] = *value;
                next.propagate(&mut budget)?;
            }
            LogicCommand::Step { ticks } => {
                if *ticks == 0 || *ticks > MAX_TICKS {
                    return Err("单次步进必须为 1–1000 tick".into());
                }
                if next.tick > MAX_SAFE_INTEGER - u64::from(*ticks) {
                    return Err("tick 超过安全整数范围".into());
                }
                for _ in 0..*ticks {
                    next.tick += 1;
                    for (index, node) in next.circuit.nodes.iter().enumerate() {
                        if node.kind == Kind::Clock {
                            next.outputs[index] = if next.outputs[index] == Signal::Zero {
                                Signal::One
                            } else {
                                Signal::Zero
                            };
                        }
                    }
                    next.propagate(&mut budget)?;
                }
            }
            LogicCommand::Reset {} => {
                next = Session::new(next.project_id, next.circuit);
            }
        }
        next.revision = request.input_revision;
        let response = next.response(request.request_id);
        self.session = Some(next);
        Ok(response)
    }
}

impl Session {
    fn new(project_id: String, circuit: Circuit) -> Self {
        let mut outputs = circuit.initial.clone();
        circuit.settle(&mut outputs);
        let mut previous_clocks = vec![Signal::HighImpedance; circuit.nodes.len()];
        let mut displays = BTreeMap::new();
        for (index, node) in circuit.nodes.iter().enumerate() {
            let inputs = circuit.inputs(index, &outputs);
            if node.kind == Kind::Dff {
                previous_clocks[index] = inputs[1];
            }
            if node.kind == Kind::Hd44780 {
                displays.insert(index, Lcd::new(inputs[2]));
            }
        }
        Self {
            project_id,
            revision: 0,
            circuit,
            outputs,
            previous_clocks,
            displays,
            tick: 0,
        }
    }

    fn propagate(&mut self, budget: &mut usize) -> Result<(), String> {
        for _ in 0..MAX_DELTA_ROUNDS {
            *budget = budget
                .checked_sub(self.circuit.nodes.len())
                .ok_or("单次请求的求值工作量超过限制")?;
            self.circuit.settle(&mut self.outputs);
            let mut updates = Vec::new();
            for (index, node) in self.circuit.nodes.iter().enumerate() {
                if node.kind == Kind::Dff {
                    let inputs = self.circuit.inputs(index, &self.outputs);
                    if self.previous_clocks[index] == Signal::Zero && inputs[1] == Signal::One {
                        updates.push((index, binary(inputs[0])));
                    }
                    self.previous_clocks[index] = inputs[1];
                }
            }
            for (&index, display) in &mut self.displays {
                display.observe(&self.circuit.inputs(index, &self.outputs));
            }
            // All registers sample the same pre-update values, regardless of node ordering.
            let mut changed = false;
            for (index, value) in updates {
                changed |= self.outputs[index] != value;
                self.outputs[index] = value;
            }
            if !changed {
                return Ok(());
            }
        }
        Err("触发器时钟反馈在 1024 轮传播后仍未稳定".into())
    }

    fn response(&self, request_id: String) -> LogicResponse {
        let mut outputs = BTreeMap::new();
        let mut inputs = BTreeMap::new();
        let mut displays = BTreeMap::new();
        let mut diagnostics = Vec::new();
        for (index, node) in self.circuit.nodes.iter().enumerate() {
            if has_output(node.kind) {
                outputs.insert(node.id.clone(), self.outputs[index]);
            }
            let signals = self.circuit.inputs(index, &self.outputs);
            inputs.insert(
                node.id.clone(),
                ports(node.kind)
                    .iter()
                    .zip(&signals)
                    .map(|(port, value)| ((*port).to_owned(), *value))
                    .collect(),
            );
            let four_bit_lcd = self
                .displays
                .get(&index)
                .is_some_and(Lcd::uses_four_bit_bus);
            let floating: Vec<_> = ports(node.kind)
                .iter()
                .zip(&signals)
                .filter_map(|(port, value)| {
                    (*value == Signal::HighImpedance
                        && !(four_bit_lcd && matches!(*port, "D0" | "D1" | "D2" | "D3")))
                    .then_some(*port)
                })
                .collect();
            let mut messages = Vec::new();
            if let Some(display) = self.displays.get(&index) {
                displays.insert(node.id.clone(), display.view());
                if let Some(message) = display.diagnostic() {
                    messages.push(message.to_owned());
                }
            }
            if !floating.is_empty() {
                messages.push(format!("输入悬空：{}", floating.join("、")));
            }
            if node.kind == Kind::Dff && binary(signals[1]) == Signal::Unknown {
                messages.push("时钟不确定；仅确定的 0→1 跳变触发采样".into());
            }
            if !messages.is_empty() {
                diagnostics.push(LogicDiagnostic {
                    node_id: Some(node.id.clone()),
                    message: messages.join("；"),
                });
            }
        }
        LogicResponse {
            schema_version: 1,
            project_id: self.project_id.clone(),
            request_id,
            input_revision: self.revision,
            tick: self.tick,
            outputs,
            inputs,
            displays,
            diagnostics,
        }
    }
}
