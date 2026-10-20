use crate::contracts::{LogicEdge, LogicNode, LogicNodeKind as Kind, LogicSignal as Signal};
use std::collections::{BTreeMap, BTreeSet};

pub(super) const MAX_NODES: usize = 512;
pub(super) const MAX_EDGES: usize = 4096;
pub(super) const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

#[derive(Clone)]
pub(super) struct Node {
    pub id: String,
    pub kind: Kind,
    pub drivers: Vec<Option<usize>>,
}

#[derive(Clone)]
pub(super) struct Circuit {
    pub nodes: Vec<Node>,
    pub order: Vec<usize>,
    pub initial: Vec<Signal>,
}

pub(super) fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
}

pub(super) fn ports(kind: Kind) -> &'static [&'static str] {
    match kind {
        Kind::And | Kind::Or | Kind::Nand | Kind::Nor | Kind::Xor | Kind::Xnor => &["A", "B"],
        Kind::Not | Kind::Buf | Kind::Probe => &["A"],
        Kind::Dff => &["D", "CLK"],
        Kind::Hd44780 => &[
            "RS", "R/W", "E", "D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7",
        ],
        Kind::Input | Kind::Clock => &[],
    }
}

pub(super) fn has_output(kind: Kind) -> bool {
    !matches!(kind, Kind::Probe | Kind::Hd44780)
}

fn combinational(kind: Kind) -> bool {
    matches!(
        kind,
        Kind::And
            | Kind::Or
            | Kind::Not
            | Kind::Nand
            | Kind::Nor
            | Kind::Xor
            | Kind::Xnor
            | Kind::Buf
    )
}

impl Circuit {
    pub fn build(
        nodes: &[LogicNode],
        edges: &[LogicEdge],
        values: &BTreeMap<String, Signal>,
    ) -> Result<Self, String> {
        if nodes.len() > MAX_NODES || edges.len() > MAX_EDGES {
            return Err("电路超过 512 个节点或 4096 条连线的限制".into());
        }
        let mut by_id = BTreeMap::new();
        for node in nodes {
            if !valid_id(&node.id) || by_id.insert(node.id.clone(), node.kind).is_some() {
                return Err("节点标识无效或重复".into());
            }
        }
        // Canonical order makes results independent of the submitted node/edge order.
        let mut nodes: Vec<Node> = by_id
            .into_iter()
            .map(|(id, kind)| Node {
                id,
                kind,
                drivers: vec![None; ports(kind).len()],
            })
            .collect();
        let indices: BTreeMap<String, usize> = nodes
            .iter()
            .enumerate()
            .map(|(i, node)| (node.id.clone(), i))
            .collect();
        let mut edge_ids = BTreeSet::new();
        let mut outgoing = vec![Vec::new(); nodes.len()];
        let mut indegree = vec![0usize; nodes.len()];
        for edge in edges {
            if !valid_id(&edge.id) || !edge_ids.insert(&edge.id) {
                return Err("连线标识无效或重复".into());
            }
            let source = *indices.get(&edge.source).ok_or("连线来源节点不存在")?;
            let target = *indices.get(&edge.target).ok_or("连线目标节点不存在")?;
            if !has_output(nodes[source].kind) {
                return Err("连线来源节点没有输出端".into());
            }
            let port = ports(nodes[target].kind)
                .iter()
                .position(|name| *name == edge.target_port)
                .ok_or("连线目标输入端无效")?;
            if nodes[target].drivers[port].replace(source).is_some() {
                return Err("一个输入端不能有多个驱动".into());
            }
            // A register's Q is state, not a combinational dependency on D or CLK.
            if combinational(nodes[target].kind) {
                outgoing[source].push(target);
                indegree[target] += 1;
            }
        }
        let mut ready: BTreeSet<usize> = indegree
            .iter()
            .enumerate()
            .filter_map(|(i, count)| (*count == 0).then_some(i))
            .collect();
        let mut order = Vec::with_capacity(nodes.len());
        while let Some(index) = ready.pop_first() {
            order.push(index);
            for &next in &outgoing[index] {
                indegree[next] -= 1;
                if indegree[next] == 0 {
                    ready.insert(next);
                }
            }
        }
        if order.len() != nodes.len() {
            return Err("电路包含未经过 D 触发器的组合反馈回路".into());
        }
        let mut initial = nodes
            .iter()
            .map(|node| match node.kind {
                Kind::Input | Kind::Clock => Signal::Zero,
                _ => Signal::Unknown,
            })
            .collect::<Vec<_>>();
        for (id, value) in values {
            let index = *indices.get(id).ok_or("初始值指向不存在的输入源")?;
            if nodes[index].kind != Kind::Input {
                return Err("初始值只能设置输入源".into());
            }
            initial[index] = *value;
        }
        Ok(Self {
            nodes,
            order,
            initial,
        })
    }

    pub fn inputs(&self, index: usize, outputs: &[Signal]) -> Vec<Signal> {
        self.nodes[index]
            .drivers
            .iter()
            .map(|driver| driver.map_or(Signal::HighImpedance, |source| outputs[source]))
            .collect()
    }

    pub fn settle(&self, outputs: &mut [Signal]) {
        for &index in &self.order {
            let node = &self.nodes[index];
            if combinational(node.kind) {
                outputs[index] = evaluate(node.kind, &self.inputs(index, outputs));
            }
        }
    }
}

pub(super) fn binary(signal: Signal) -> Signal {
    match signal {
        Signal::Zero | Signal::One => signal,
        _ => Signal::Unknown,
    }
}

fn invert(signal: Signal) -> Signal {
    match signal {
        Signal::Zero => Signal::One,
        Signal::One => Signal::Zero,
        _ => Signal::Unknown,
    }
}

fn evaluate(kind: Kind, inputs: &[Signal]) -> Signal {
    let a = inputs[0];
    if kind == Kind::Buf {
        return binary(a);
    }
    if kind == Kind::Not {
        return invert(a);
    }
    let b = inputs[1];
    match kind {
        Kind::And | Kind::Nand => {
            let value = if a == Signal::Zero || b == Signal::Zero {
                Signal::Zero
            } else if a == Signal::One && b == Signal::One {
                Signal::One
            } else {
                Signal::Unknown
            };
            if kind == Kind::Nand {
                invert(value)
            } else {
                value
            }
        }
        Kind::Or | Kind::Nor => {
            let value = if a == Signal::One || b == Signal::One {
                Signal::One
            } else if a == Signal::Zero && b == Signal::Zero {
                Signal::Zero
            } else {
                Signal::Unknown
            };
            if kind == Kind::Nor {
                invert(value)
            } else {
                value
            }
        }
        Kind::Xor | Kind::Xnor => {
            let value = if binary(a) == Signal::Unknown || binary(b) == Signal::Unknown {
                Signal::Unknown
            } else if a == b {
                Signal::Zero
            } else {
                Signal::One
            };
            if kind == Kind::Xnor {
                invert(value)
            } else {
                value
            }
        }
        _ => unreachable!("only combinational gates are evaluated"),
    }
}
