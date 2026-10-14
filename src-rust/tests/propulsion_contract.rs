use lmbox::contracts::propulsion::DesignRequest;
use serde_json::Value;

#[test]
fn design_fixtures_round_trip_and_unknown_fields_are_rejected() {
    let schema: Value = serde_json::from_str(include_str!(
        "../../contracts/schemas/v1/propulsion-request.schema.json"
    ))
    .unwrap();
    let validator = jsonschema::validator_for(&schema).unwrap();
    for source in [
        include_str!("../../contracts/fixtures/v1/propulsion-nozzle-request.json"),
        include_str!("../../contracts/fixtures/v1/propulsion-chamber-request.json"),
        include_str!("../../contracts/fixtures/v1/propulsion-injector-request.json"),
    ] {
        let request: DesignRequest = serde_json::from_str(source).unwrap();
        let mut value = serde_json::to_value(request).unwrap();
        validator.validate(&value).unwrap();
        value["request"]["runtimePath"] = "not-allowed".into();
        assert!(validator.validate(&value).is_err());
        assert!(serde_json::from_value::<DesignRequest>(value).is_err());
    }
}

#[test]
fn unsupported_models_and_schema_bounds_are_explicit() {
    let schema: Value = serde_json::from_str(include_str!(
        "../../contracts/schemas/v1/propulsion-request.schema.json"
    ))
    .unwrap();
    let validator = jsonschema::validator_for(&schema).unwrap();
    let original: Value = serde_json::from_str(include_str!(
        "../../contracts/fixtures/v1/propulsion-nozzle-request.json"
    ))
    .unwrap();
    for (pointer, value) in [
        ("/request/identity/schemaVersion", 2.into()),
        ("/request/segments", 2049.into()),
        ("/request/ambientPressurePa", (-1).into()),
        ("/request/contour/type", "raoOptimized".into()),
    ] {
        let mut changed = original.clone();
        *changed.pointer_mut(pointer).unwrap() = value;
        assert!(validator.validate(&changed).is_err(), "{pointer}");
    }
    let mut injector: Value = serde_json::from_str(include_str!(
        "../../contracts/fixtures/v1/propulsion-injector-request.json"
    ))
    .unwrap();
    injector["request"]["fuel"]["passage"] = serde_json::json!({"type":"swirl"});
    assert!(validator.validate(&injector).is_err());
    assert!(serde_json::from_value::<DesignRequest>(injector).is_err());
}
