use lmbox::contracts::thermochemistry::CeaRequest;

#[test]
fn requests_match_schema_and_reject_unknown_fields() {
    let schema: serde_json::Value = serde_json::from_str(include_str!(
        "../../contracts/schemas/v1/cea-request.schema.json"
    ))
    .unwrap();
    let validator = jsonschema::validator_for(&schema).unwrap();
    for source in [
        include_str!("../../contracts/fixtures/v1/cea-rocket-request.json"),
        include_str!("../../contracts/fixtures/v1/cea-hp-request.json"),
    ] {
        let request: CeaRequest = serde_json::from_str(source).unwrap();
        let mut value = serde_json::to_value(request).unwrap();
        validator.validate(&value).unwrap();
        value["runtimePath"] = "/not/a/request/field".into();
        assert!(validator.validate(&value).is_err());
        assert!(serde_json::from_value::<CeaRequest>(value).is_err());
    }
}
