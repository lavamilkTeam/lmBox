use lmbox::{contracts::LogicRequest, modules::digital_logic::Simulator};
use serde_json::{json, Value};

const REQUEST: &str = include_str!("../../contracts/fixtures/v1/digital-logic-request.json");
const REQUEST_SCHEMA: &str =
    include_str!("../../contracts/schemas/v1/digital-logic-request.schema.json");
const RESPONSE_SCHEMA: &str =
    include_str!("../../contracts/schemas/v1/digital-logic-response.schema.json");

#[test]
fn shared_request_and_actual_session_response_match_the_schemas() {
    let request: Value = serde_json::from_str(REQUEST).unwrap();
    let schema: Value = serde_json::from_str(REQUEST_SCHEMA).unwrap();
    let validator = jsonschema::validator_for(&schema).unwrap();
    assert!(validator.is_valid(&request));
    let typed: LogicRequest = serde_json::from_value(request.clone()).unwrap();
    assert_eq!(serde_json::to_value(&typed).unwrap(), request);
    let response = serde_json::to_value(Simulator::default().request(typed).unwrap()).unwrap();
    let schema: Value = serde_json::from_str(RESPONSE_SCHEMA).unwrap();
    let validator = jsonschema::validator_for(&schema).unwrap();
    assert!(validator.is_valid(&response), "{response}");
    assert_eq!(response["projectId"], request["projectId"]);
    assert_eq!(response["requestId"], request["requestId"]);
    assert_eq!(response["inputRevision"], request["inputRevision"]);
}

#[test]
fn command_tags_and_camel_case_fields_round_trip_without_unknown_fields() {
    let schema: Value = serde_json::from_str(REQUEST_SCHEMA).unwrap();
    let validator = jsonschema::validator_for(&schema).unwrap();
    for command in [
        json!({"type": "set_input", "nodeId": "input-a", "value": "1"}),
        json!({"type": "step", "ticks": 1}),
        json!({"type": "reset"}),
    ] {
        let mut request: Value = serde_json::from_str(REQUEST).unwrap();
        request["command"] = command;
        let typed: LogicRequest = serde_json::from_value(request.clone()).unwrap();
        assert!(validator.is_valid(&serde_json::to_value(typed).unwrap()));
        request["command"]["unexpected"] = json!(true);
        assert!(!validator.is_valid(&request));
        assert!(serde_json::from_value::<LogicRequest>(request).is_err());
    }
}

#[test]
fn schema_rejects_unsafe_counters_invalid_signals_and_oversized_steps() {
    let schema: Value = serde_json::from_str(REQUEST_SCHEMA).unwrap();
    let validator = jsonschema::validator_for(&schema).unwrap();
    let mut request: Value = serde_json::from_str(REQUEST).unwrap();
    request["inputRevision"] = json!(9007199254740992_u64);
    assert!(!validator.is_valid(&request));
    request["inputRevision"] = json!(1);
    for command in [
        json!({"type": "set_input", "nodeId": "input-a", "value": "X"}),
        json!({"type": "step", "ticks": 1001}),
        json!({"type": "step", "ticks": 0}),
    ] {
        request["command"] = command;
        assert!(!validator.is_valid(&request));
    }
}
