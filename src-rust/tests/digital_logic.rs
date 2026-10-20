use lmbox::contracts::{LogicRequest, LogicResponse, LogicSignal as Signal};
use lmbox::modules::digital_logic::Simulator;
use serde_json::{json, Value};

struct Client {
    simulator: Simulator,
    revision: u64,
}

impl Client {
    fn new() -> Self {
        Self {
            simulator: Simulator::new(),
            revision: 0,
        }
    }
    fn request(&mut self, command: Value) -> Result<LogicResponse, String> {
        self.revision += 1;
        self.simulator.request(request(self.revision, command))
    }
    fn load(&mut self, nodes: Vec<Value>, edges: Vec<Value>, values: Value) -> LogicResponse {
        self.request(json!({"type":"load", "nodes":nodes, "edges":edges, "values":values}))
            .unwrap()
    }
    fn set(&mut self, id: &str, value: bool) -> LogicResponse {
        self.request(json!({"type":"set_input", "nodeId":id, "value":if value {"1"} else {"0"}}))
            .unwrap()
    }
    fn step(&mut self, ticks: u32) -> LogicResponse {
        self.request(json!({"type":"step","ticks":ticks})).unwrap()
    }
}

fn request(revision: u64, command: Value) -> LogicRequest {
    serde_json::from_value(json!({"schemaVersion":1,"projectId":"project","requestId":format!("request-{revision}"),"inputRevision":revision,"command":command})).unwrap()
}
fn node(id: &str, kind: &str) -> Value {
    json!({"id":id,"kind":kind})
}
fn edge(source: &str, target: &str, port: &str) -> Value {
    json!({"id":format!("{source}-{target}-{}",port.replace('/',"_")),"source":source,"target":target,"targetPort":port})
}
fn signal(value: char) -> Signal {
    serde_json::from_value(json!(value.to_string())).unwrap()
}

#[test]
fn exhaustive_four_state_gate_tables_and_probe_input() {
    let tables = [
        ("and", ["0000", "01XX", "0XXX", "0XXX"]),
        ("nand", ["1111", "10XX", "1XXX", "1XXX"]),
        ("or", ["01XX", "1111", "X1XX", "X1XX"]),
        ("nor", ["10XX", "0000", "X0XX", "X0XX"]),
        ("xor", ["01XX", "10XX", "XXXX", "XXXX"]),
        ("xnor", ["10XX", "01XX", "XXXX", "XXXX"]),
    ];
    let mut nodes = vec![
        node("a", "input"),
        node("b", "input"),
        node("not", "not"),
        node("buf", "buf"),
        node("probe", "probe"),
    ];
    let mut edges = vec![
        edge("a", "not", "A"),
        edge("a", "buf", "A"),
        edge("a", "probe", "A"),
    ];
    for (kind, _) in tables {
        nodes.push(node(kind, kind));
        edges.extend([edge("a", kind, "A"), edge("b", kind, "B")]);
    }
    let mut client = Client::new();
    for (ai, a) in ['0', '1', 'X', 'Z'].into_iter().enumerate() {
        for (bi, b) in ['0', '1', 'X', 'Z'].into_iter().enumerate() {
            let result = client.load(
                nodes.clone(),
                edges.clone(),
                json!({"a":a.to_string(),"b":b.to_string()}),
            );
            for (kind, table) in tables {
                assert_eq!(
                    result.outputs[kind],
                    signal(table[ai].chars().nth(bi).unwrap()),
                    "{kind}({a},{b})"
                );
            }
            assert_eq!(result.outputs["not"], signal(['1', '0', 'X', 'X'][ai]));
            assert_eq!(result.outputs["buf"], signal(['0', '1', 'X', 'X'][ai]));
            assert_eq!(result.inputs["probe"]["A"], signal(a));
            assert!(!result.outputs.contains_key("probe"));
        }
    }
}

#[test]
fn floating_inputs_are_z_without_becoming_false_values() {
    let mut client = Client::new();
    let result = client.load(
        vec![
            node("input", "input"),
            node("and", "and"),
            node("not", "not"),
            node("probe", "probe"),
        ],
        vec![edge("input", "and", "A")],
        json!({}),
    );
    assert_eq!(result.outputs["input"], Signal::Zero);
    assert_eq!(result.inputs["and"]["B"], Signal::HighImpedance);
    assert_eq!(result.outputs["and"], Signal::Zero);
    assert_eq!(result.outputs["not"], Signal::Unknown);
    assert_eq!(result.inputs["probe"]["A"], Signal::HighImpedance);
    assert_eq!(result.diagnostics.len(), 3);
    let result = client.set("input", true);
    assert_eq!(result.outputs["and"], Signal::Unknown);
    assert_eq!(result.tick, 0);
}

#[test]
fn propagation_is_topological_and_independent_of_submission_order() {
    let nodes = vec![
        node("a-out", "not"),
        node("m-middle", "not"),
        node("z-source", "input"),
    ];
    let edges = vec![
        edge("m-middle", "a-out", "A"),
        edge("z-source", "m-middle", "A"),
    ];
    let a = Client::new().load(nodes.clone(), edges.clone(), json!({"z-source":"1"}));
    let b = Client::new().load(
        nodes.into_iter().rev().collect(),
        edges.into_iter().rev().collect(),
        json!({"z-source":"1"}),
    );
    assert_eq!(a.outputs["a-out"], Signal::One);
    assert_eq!(
        serde_json::to_value(a).unwrap(),
        serde_json::to_value(b).unwrap()
    );
}

#[test]
fn registers_sample_simultaneously_on_rising_edges_only() {
    for reversed in [false, true] {
        let mut nodes = vec![
            node("clock", "clock"),
            node("data", "input"),
            node("first", "dff"),
            node("second", "dff"),
        ];
        let mut edges = vec![
            edge("clock", "first", "CLK"),
            edge("clock", "second", "CLK"),
            edge("data", "first", "D"),
            edge("first", "second", "D"),
        ];
        if reversed {
            nodes.reverse();
            edges.reverse();
        }
        let mut client = Client::new();
        let result = client.load(nodes, edges, json!({"data":"1"}));
        assert_eq!(result.outputs["clock"], Signal::Zero);
        assert_eq!(result.outputs["first"], Signal::Unknown);
        let result = client.step(1);
        assert_eq!(result.tick, 1);
        assert_eq!(result.outputs["first"], Signal::One);
        assert_eq!(result.outputs["second"], Signal::Unknown);
        assert_eq!(client.set("data", false).outputs["first"], Signal::One);
        assert_eq!(client.step(1).outputs["first"], Signal::One);
        let result = client.step(1);
        assert_eq!(result.outputs["first"], Signal::Zero);
        assert_eq!(result.outputs["second"], Signal::One);
        let result = client.request(json!({"type":"reset"})).unwrap();
        assert_eq!(result.tick, 0);
        assert_eq!(result.outputs["data"], Signal::One);
        assert_eq!(result.outputs["clock"], Signal::Zero);
        assert_eq!(result.outputs["first"], Signal::Unknown);
        assert_eq!(result.outputs["second"], Signal::Unknown);
    }
}

#[test]
fn sequential_feedback_settles_and_generated_clock_edges_propagate() {
    let mut client = Client::new();
    client.load(
        vec![
            node("enable", "input"),
            node("clock", "clock"),
            node("q", "dff"),
            node("invert", "not"),
            node("gate", "and"),
        ],
        vec![
            edge("clock", "q", "CLK"),
            edge("gate", "q", "D"),
            edge("q", "invert", "A"),
            edge("invert", "gate", "A"),
            edge("enable", "gate", "B"),
        ],
        json!({}),
    );
    assert_eq!(client.step(1).outputs["q"], Signal::Zero);
    client.set("enable", true);
    assert_eq!(client.step(2).outputs["q"], Signal::One);
    assert_eq!(client.step(2).outputs["q"], Signal::Zero);

    let mut client = Client::new();
    client.load(
        vec![
            node("manual", "input"),
            node("data", "input"),
            node("one", "input"),
            node("a", "dff"),
            node("b", "dff"),
        ],
        vec![
            edge("manual", "a", "CLK"),
            edge("data", "a", "D"),
            edge("one", "b", "D"),
            edge("a", "b", "CLK"),
        ],
        json!({"one":"1"}),
    );
    assert_eq!(client.set("manual", true).outputs["a"], Signal::Zero);
    client.set("manual", false);
    client.set("data", true);
    let result = client.set("manual", true);
    assert_eq!(result.outputs["a"], Signal::One);
    assert_eq!(result.outputs["b"], Signal::One);
    assert_eq!(result.tick, 0);
}

#[test]
fn loading_high_clock_does_not_create_an_edge_and_unknown_d_samples_x() {
    let mut client = Client::new();
    client.load(
        vec![node("clk", "input"), node("q", "dff")],
        vec![edge("clk", "q", "CLK")],
        json!({"clk":"1"}),
    );
    assert_eq!(client.step(1).outputs["q"], Signal::Unknown);
    client.set("clk", false);
    let result = client.set("clk", true);
    assert_eq!(result.inputs["q"]["D"], Signal::HighImpedance);
    assert_eq!(result.outputs["q"], Signal::Unknown);

    let mut client = Client::new();
    client.load(
        vec![
            node("clk", "input"),
            node("data", "input"),
            node("q", "dff"),
        ],
        vec![edge("clk", "q", "CLK"), edge("data", "q", "D")],
        json!({"clk":"X","data":"1"}),
    );
    assert_eq!(client.set("clk", true).outputs["q"], Signal::Unknown);
    client.set("clk", false);
    assert_eq!(client.set("clk", true).outputs["q"], Signal::One);
}

#[test]
fn invalid_topologies_and_source_capabilities_are_rejected_atomically() {
    let valid_nodes = vec![node("source", "input"), node("clock", "clock")];
    let mut client = Client::new();
    client.load(valid_nodes.clone(), vec![], json!({"source":"1"}));
    client.step(1);
    let cases = vec![
        (
            vec![node("dup", "input"), node("dup", "not")],
            vec![],
            json!({}),
        ),
        (vec![node("bad/id", "input")], vec![], json!({})),
        (
            vec![node("a", "not"), node("b", "not")],
            vec![edge("a", "b", "A"), edge("b", "a", "A")],
            json!({}),
        ),
        (vec![node("a", "not")], vec![edge("a", "a", "A")], json!({})),
        (
            vec![node("a", "input"), node("b", "not")],
            vec![edge("a", "b", "B")],
            json!({}),
        ),
        (
            vec![node("a", "input"), node("b", "not")],
            vec![edge("missing", "b", "A")],
            json!({}),
        ),
        (
            vec![node("a", "input"), node("b", "not")],
            vec![edge("a", "missing", "A")],
            json!({}),
        ),
        (
            vec![node("a", "input"), node("b", "input")],
            vec![edge("a", "b", "A")],
            json!({}),
        ),
        (
            vec![node("a", "probe"), node("b", "not")],
            vec![edge("a", "b", "A")],
            json!({}),
        ),
        (
            vec![node("a", "hd44780"), node("b", "not")],
            vec![edge("a", "b", "A")],
            json!({}),
        ),
        (
            vec![node("a", "input"), node("b", "not")],
            vec![edge("a", "b", "A"), edge("a", "b", "A")],
            json!({}),
        ),
        (
            vec![node("a", "input"), node("b", "input"), node("c", "not")],
            vec![edge("a", "c", "A"), edge("b", "c", "A")],
            json!({}),
        ),
        (valid_nodes.clone(), vec![], json!({"clock":"1"})),
        (valid_nodes.clone(), vec![], json!({"missing":"1"})),
    ];
    for (nodes, edges, values) in cases {
        assert!(client
            .request(json!({"type":"load","nodes":nodes,"edges":edges,"values":values}))
            .is_err());
    }
    let result = client.step(1);
    assert_eq!(result.tick, 2);
    assert_eq!(result.outputs["source"], Signal::One);
    // A register breaks the combinational cycle, including direct Q-to-D feedback.
    client.load(
        vec![node("q", "dff"), node("clk", "clock")],
        vec![edge("q", "q", "D"), edge("clk", "q", "CLK")],
        json!({}),
    );
}

#[test]
fn limits_identity_versions_and_failed_commands_preserve_session() {
    let mut simulator = Simulator::new();
    assert!(simulator
        .request(request(1, json!({"type":"step","ticks":1})))
        .is_err());
    let load = json!({"type":"load","nodes":[node("source","input"),node("clock","clock")],"edges":[],"values":{"source":"1"}});
    let mut malformed = request(10, load.clone());
    malformed.schema_version = 2;
    assert!(simulator.request(malformed).is_err());
    let initial = simulator.request(request(10, load.clone())).unwrap();
    assert_eq!(initial.request_id, "request-10");
    assert_eq!(initial.input_revision, 10);
    for revision in [0, 9, 9_007_199_254_740_992] {
        assert!(simulator.request(request(revision, load.clone())).is_err());
    }
    for (project, request_id) in [("other", "request"), ("bad/id", "request"), ("project", "")] {
        let mut wrong = request(10, json!({"type":"step","ticks":1}));
        wrong.project_id = project.into();
        wrong.request_id = request_id.into();
        assert!(simulator.request(wrong).is_err());
    }
    for command in [
        json!({"type":"step","ticks":0}),
        json!({"type":"step","ticks":1001}),
        json!({"type":"set_input","nodeId":"source","value":"X"}),
        json!({"type":"set_input","nodeId":"source","value":"Z"}),
        json!({"type":"set_input","nodeId":"clock","value":"1"}),
        json!({"type":"set_input","nodeId":"missing","value":"1"}),
    ] {
        assert!(simulator.request(request(100, command)).is_err());
    }
    let result = simulator
        .request(request(10, json!({"type":"step","ticks":1000})))
        .unwrap();
    assert_eq!(result.tick, 1000);
    assert_eq!(result.outputs["source"], Signal::One);
    assert_eq!(result.outputs["clock"], Signal::Zero);
    let too_many: Vec<_> = (0..513).map(|i| node(&format!("n{i}"), "input")).collect();
    assert!(simulator
        .request(request(
            100,
            json!({"type":"load","nodes":too_many,"edges":[],"values":{}})
        ))
        .is_err());
    assert!(simulator
        .request(request(
            100,
            json!({"type":"load","nodes":[],"edges":vec![edge("a","b","A");4097],"values":{}})
        ))
        .is_err());
    let result = simulator
        .request(request(11, json!({"type":"step","ticks":1})))
        .unwrap();
    assert_eq!(result.tick, 1001);
    let maximum: Vec<_> = (0..512).map(|i| node(&format!("n{i}"), "input")).collect();
    let result = simulator
        .request(request(
            12,
            json!({"type":"load","nodes":maximum,"edges":[],"values":{}}),
        ))
        .unwrap();
    assert_eq!(result.outputs.len(), 512);
    assert_eq!(result.tick, 0);
    let empty = simulator
        .request(request(
            13,
            json!({"type":"load","nodes":[],"edges":[],"values":{}}),
        ))
        .unwrap();
    assert!(empty.outputs.is_empty());
}

struct DisplayClient {
    client: Client,
    four_bit: bool,
}

impl DisplayClient {
    fn new(four_bit: bool) -> Self {
        let mut client = Client::new();
        let mut nodes = vec![node("lcd", "hd44780")];
        let mut edges = vec![];
        for (id, port) in [("rs", "RS"), ("rw", "R/W"), ("e", "E")] {
            nodes.push(node(id, "input"));
            edges.push(edge(id, "lcd", port));
        }
        for i in if four_bit { 4..8 } else { 0..8 } {
            let id = format!("d{i}");
            nodes.push(node(&id, "input"));
            edges.push(edge(&id, "lcd", &format!("D{i}")));
        }
        client.load(nodes, edges, json!({}));
        Self { client, four_bit }
    }
    fn pulse(&mut self) -> LogicResponse {
        self.client.set("e", true);
        self.client.set("e", false)
    }
    fn nibble(&mut self, rs: bool, value: u8) -> LogicResponse {
        self.client.set("rs", rs);
        for i in 0..4 {
            self.client
                .set(&format!("d{}", i + 4), value & (1 << i) != 0);
        }
        self.pulse()
    }
    fn write(&mut self, rs: bool, value: u8) -> LogicResponse {
        if self.four_bit {
            self.nibble(rs, value >> 4);
            self.nibble(rs, value & 15)
        } else {
            self.client.set("rs", rs);
            for i in 0..8 {
                self.client.set(&format!("d{i}"), value & (1 << i) != 0);
            }
            self.pulse()
        }
    }
    fn initialize(&mut self) {
        if self.four_bit {
            for nibble in [3, 3, 3, 2] {
                self.nibble(false, nibble);
            }
        }
        self.write(false, if self.four_bit { 0x28 } else { 0x38 });
        self.write(false, 0x0e);
        self.write(false, 0x06);
        self.write(false, 0x01);
    }
}

#[test]
fn lcd_eight_bit_writes_clear_home_display_control_and_reset() {
    let mut lcd = DisplayClient::new(false);
    lcd.initialize();
    lcd.write(true, b'H');
    let result = lcd.write(true, b'i');
    assert_eq!(
        result.displays["lcd"].rows,
        ["Hi              ", "                "]
    );
    assert_eq!(result.displays["lcd"].cursor, Some(2));
    assert!(result.displays["lcd"].display_on);
    assert!(!result.outputs.contains_key("lcd"));
    lcd.write(false, 0xc0);
    let result = lcd.write(true, b'R');
    assert_eq!(result.displays["lcd"].rows[1], "R               ");
    assert_eq!(result.displays["lcd"].cursor, Some(17));
    let result = lcd.write(false, 0x08);
    assert!(!result.displays["lcd"].display_on);
    assert_eq!(result.displays["lcd"].rows, ["                "; 2]);
    let result = lcd.write(false, 0x0c);
    assert_eq!(result.displays["lcd"].rows[0], "Hi              ");
    assert_eq!(result.displays["lcd"].cursor, None);
    lcd.write(false, 0x0e);
    let result = lcd.write(false, 0x02);
    assert_eq!(result.displays["lcd"].cursor, Some(0));
    assert_eq!(result.displays["lcd"].rows[1], "R               ");
    let result = lcd.write(false, 1);
    assert_eq!(result.displays["lcd"].rows, ["                "; 2]);
    lcd.write(true, b'Z');
    let result = lcd.client.request(json!({"type":"reset"})).unwrap();
    assert_eq!(result.displays["lcd"].rows, ["                "; 2]);
    assert!(!result.displays["lcd"].display_on);
    assert_eq!(result.tick, 0);
}

#[test]
fn lcd_four_bit_initialization_ignores_unconnected_lower_pins_and_waits_for_second_nibble() {
    let mut lcd = DisplayClient::new(true);
    lcd.initialize();
    let half = lcd.nibble(true, 4);
    assert_eq!(half.displays["lcd"].rows[0], "                ");
    let result = lcd.nibble(true, 8);
    assert_eq!(result.displays["lcd"].rows[0], "H               ");
    assert_eq!(result.inputs["lcd"]["D0"], Signal::HighImpedance);
    assert!(result.diagnostics.is_empty());
    lcd.write(false, 0xc0);
    for byte in b"4-bit" {
        lcd.write(true, *byte);
    }
    let result = lcd.write(false, 0x02);
    assert_eq!(result.displays["lcd"].rows[1], "4-bit           ");
    lcd.nibble(true, 4);
    let rejected = lcd.nibble(false, 1);
    assert!(rejected
        .diagnostics
        .iter()
        .any(|d| d.message.contains("RS 不一致")));
    assert_eq!(rejected.displays["lcd"].rows[0], "H               ");
    let result = lcd.write(true, b'B');
    assert_eq!(result.displays["lcd"].rows[0], "B               ");
}

#[test]
fn lcd_four_bit_resynchronization_preserves_ddram_and_accepts_later_writes() {
    let mut lcd = DisplayClient::new(true);
    lcd.initialize();
    lcd.write(true, b'A');
    lcd.write(false, 0xc0);
    lcd.write(true, b'R');

    for nibble in [3, 3, 3, 2] {
        let result = lcd.nibble(false, nibble);
        assert!(!result
            .diagnostics
            .iter()
            .any(|d| d.message.contains("未接收")));
    }
    let result = lcd.write(false, 0x28);
    assert_eq!(
        result.displays["lcd"].rows,
        ["A               ", "R               "]
    );
    assert_eq!(result.displays["lcd"].cursor, Some(17));
    let result = lcd.write(true, b'B');
    assert_eq!(result.displays["lcd"].rows[1], "RB              ");
    lcd.write(false, 0x02);
    let result = lcd.write(true, b'C');
    assert_eq!(
        result.displays["lcd"].rows,
        ["C               ", "RB              "]
    );
}

#[test]
fn lcd_function_set_sync_does_not_accept_unknown_lower_data() {
    let mut lcd = DisplayClient::new(true);
    lcd.initialize();
    lcd.write(true, b'A');
    // A complete function set switches to eight bits; the lower pins remain unconnected.
    lcd.write(false, 0x30);
    for (rs, nibble) in [(true, 3), (false, 1)] {
        let rejected = lcd.nibble(rs, nibble);
        assert!(rejected
            .diagnostics
            .iter()
            .any(|d| d.message.contains("数据总线含 X 或 Z")));
        assert_eq!(rejected.displays["lcd"].rows[0], "A               ");
    }
    lcd.nibble(false, 2);
    lcd.write(false, 0x28);
    let result = lcd.write(true, b'B');
    assert_eq!(result.displays["lcd"].rows[0], "AB              ");
}

#[test]
fn lcd_ddram_wrapping_entry_direction_and_display_shift() {
    let mut lcd = DisplayClient::new(false);
    lcd.initialize();
    lcd.write(false, 0xa7);
    lcd.write(true, b'T');
    let result = lcd.write(true, b'U');
    assert_eq!(result.displays["lcd"].rows[1], "U               ");
    lcd.write(false, 0xc1);
    lcd.write(false, 0x04);
    lcd.write(true, b'Q');
    let result = lcd.write(true, b'W');
    assert_eq!(result.displays["lcd"].rows[1], "WQ              ");
    lcd.write(false, 1);
    lcd.write(true, b'A');
    let result = lcd.write(true, b'B');
    assert_eq!(result.displays["lcd"].rows[0], "AB              ");
    lcd.write(false, 0x90);
    lcd.write(true, b'X');
    let result = lcd.write(false, 0x18);
    assert_eq!(result.displays["lcd"].rows[0], "B              X");
    let result = lcd.write(false, 0x1c);
    assert_eq!(result.displays["lcd"].rows[0], "AB              ");
    lcd.write(false, 1);
    lcd.write(false, 0x07);
    let result = lcd.write(true, b'Y');
    assert_eq!(result.displays["lcd"].rows[0], "                ");
    let result = lcd.write(false, 2);
    assert_eq!(result.displays["lcd"].rows[0], "Y               ");
    let invalid = lcd.write(false, 0xb0);
    assert!(invalid
        .diagnostics
        .iter()
        .any(|d| d.message.contains("地址超出")));
}

#[test]
fn lcd_rejects_reads_cgram_font_and_unknown_bus_without_fabricated_text() {
    let mut lcd = DisplayClient::new(false);
    lcd.initialize();
    lcd.write(true, b'A');
    lcd.client.set("rw", true);
    let result = lcd.pulse();
    assert!(result
        .diagnostics
        .iter()
        .any(|d| d.message.contains("忙标志")));
    assert_eq!(result.displays["lcd"].rows[0], "A               ");
    lcd.client.set("rw", false);
    lcd.write(false, 0x40);
    let result = lcd.write(true, b'B');
    assert_eq!(result.displays["lcd"].rows[0], "A               ");
    assert!(result
        .diagnostics
        .iter()
        .any(|d| d.message.contains("CGRAM")));
    lcd.write(false, 0x80);
    let result = lcd.write(true, b'C');
    assert_eq!(result.displays["lcd"].rows[0], "C               ");
    let result = lcd.write(false, 0x34);
    assert_eq!(result.displays["lcd"].rows, ["                "; 2]);
    assert!(result
        .diagnostics
        .iter()
        .any(|d| d.message.contains("5×10")));
    lcd.write(false, 0x38);
    let result = lcd.write(true, 0x00);
    assert!(result.displays["lcd"].rows[0].contains('\u{fffd}'));
    assert!(result
        .diagnostics
        .iter()
        .any(|d| d.message.contains("字形")));

    let mut client = Client::new();
    let mut nodes = vec![
        node("lcd", "hd44780"),
        node("e", "input"),
        node("zero", "input"),
        node("unknown", "input"),
    ];
    nodes.push(node("one", "input"));
    let mut edges = vec![
        edge("e", "lcd", "E"),
        edge("zero", "lcd", "RS"),
        edge("zero", "lcd", "R/W"),
    ];
    for i in 0..8 {
        edges.push(edge(
            if i == 2 { "unknown" } else { "zero" },
            "lcd",
            &format!("D{i}"),
        ));
    }
    client.load(nodes, edges, json!({"unknown":"X"}));
    client.set("e", true);
    let result = client.set("e", false);
    assert!(result
        .diagnostics
        .iter()
        .any(|d| d.message.contains("数据总线含 X 或 Z")));
    assert_eq!(result.displays["lcd"].rows, ["                "; 2]);
}

#[test]
fn public_responses_match_the_shared_schema_including_lcd_port_names() {
    let schema: Value = serde_json::from_str(include_str!(
        "../../contracts/schemas/v1/digital-logic-response.schema.json"
    ))
    .unwrap();
    let validator = jsonschema::validator_for(&schema).unwrap();
    let mut lcd = DisplayClient::new(true);
    lcd.initialize();
    for result in [
        lcd.write(true, b'A'),
        lcd.write(false, 0x0f),
        lcd.write(false, 0x40),
        lcd.client.request(json!({"type":"reset"})).unwrap(),
    ] {
        let value = serde_json::to_value(result).unwrap();
        assert!(
            validator.is_valid(&value),
            "{value}: {:?}",
            validator
                .iter_errors(&value)
                .map(|e| e.to_string())
                .collect::<Vec<_>>()
        );
    }
}
