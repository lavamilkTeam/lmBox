use lmbox::{app::build_preview, contracts::PreviewRequest, features::stencil::validate_preview};
use std::{
    path::Path,
    sync::{atomic::AtomicBool, Arc},
};

fn request() -> PreviewRequest {
    serde_json::from_str(include_str!("../../contracts/fixtures/v1/preview.json")).unwrap()
}

#[test]
fn preview_contract_and_parameter_validation() {
    let schema: serde_json::Value = serde_json::from_str(include_str!(
        "../../contracts/schemas/v1/preview.schema.json"
    ))
    .unwrap();
    let graphics: serde_json::Value = serde_json::from_str(include_str!(
        "../../contracts/schemas/v2/graphics.schema.json"
    ))
    .unwrap();
    let validator = jsonschema::options()
        .with_resource(
            "https://lmbox.local/contracts/schemas/v2/graphics.schema.json",
            jsonschema::Resource::from_contents(graphics).unwrap(),
        )
        .build(&schema)
        .unwrap();
    let mut data = request();
    validator
        .validate(&serde_json::to_value(&data).unwrap())
        .unwrap();
    assert!(validate_preview(&data).is_ok());
    data.settings.thickness = 0.0;
    assert!(validate_preview(&data).is_err());
    assert!(validator
        .validate(&serde_json::to_value(&data).unwrap())
        .is_err());
}

#[test]
fn python_preview_returns_matching_inspected_mesh() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    let result = build_preview(&request(), root, Arc::new(AtomicBool::new(false))).unwrap();
    assert_eq!(result["jobId"], "test-job");
    assert_eq!(result["mesh"]["summary"]["holeCount"], 2);
    assert!(!result["mesh"]["positions"].as_array().unwrap().is_empty());
}

#[test]
fn cancelled_job_does_not_return_a_model() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    assert!(
        build_preview(&request(), root, Arc::new(AtomicBool::new(true)))
            .unwrap_err()
            .contains("取消")
    );
}

#[test]
fn closing_cli_input_cancels_the_owned_python_task() {
    use std::io::Write;
    use std::process::{Command, Stdio};
    let mut child = Command::new(env!("CARGO_BIN_EXE_preview"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut input = child.stdin.take().unwrap();
    writeln!(input, "{}", serde_json::to_string(&request()).unwrap()).unwrap();
    drop(input);
    let result = child.wait_with_output().unwrap();
    let response: serde_json::Value = serde_json::from_slice(&result.stdout).unwrap();
    assert!(response["error"].as_str().unwrap().contains("取消"));
}

#[test]
fn editing_contract_and_export_are_validated_across_the_native_boundary() {
    let mut data: PreviewRequest =
        serde_json::from_str(include_str!("../../contracts/fixtures/v1/editing.json")).unwrap();
    assert!(validate_preview(&data).is_ok());
    data.export_format = Some("svg".into());
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    let result = build_preview(&data, root, Arc::new(AtomicBool::new(false))).unwrap();
    assert_eq!(result["artifact"]["format"], "svg");
    assert!(result["artifact"]["content"]
        .as_str()
        .unwrap()
        .contains("<svg"));
    assert_eq!(result["mesh"]["objects"][0]["id"], "0:0:0");
    data.settings.design.as_mut().unwrap().optimization.grid_web = 0.;
    assert!(validate_preview(&data).is_err());
    data.settings.design.as_mut().unwrap().optimization.grid_web = 0.4;
    data.edits[0].id = "../file".into();
    assert!(validate_preview(&data).is_err());
}

#[test]
fn inverse_taper_preserves_the_selected_mode_through_python() {
    let mut data: PreviewRequest =
        serde_json::from_str(include_str!("../../contracts/fixtures/v1/editing.json")).unwrap();
    let opt = &mut data.settings.design.as_mut().unwrap().optimization;
    assert!(!opt.inverse_taper);
    opt.taper = 120.;
    opt.inverse_taper = true;
    assert!(validate_preview(&data).is_ok());
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    let result = build_preview(&data, root, Arc::new(AtomicBool::new(false))).unwrap();
    let ring = result["mesh"]["objects"][0]["rings"][0].as_array().unwrap();
    let xs: Vec<f64> = ring.iter().map(|p| p[0].as_f64().unwrap()).collect();
    let width = xs.iter().copied().fold(f64::NEG_INFINITY, f64::max)
        - xs.iter().copied().fold(f64::INFINITY, f64::min);
    assert!((width - 1.6).abs() < 1e-8);
    data.settings.design.as_mut().unwrap().optimization.taper = 200.;
    assert!(validate_preview(&data).is_err());
}
