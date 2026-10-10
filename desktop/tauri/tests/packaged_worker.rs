#[test]
fn packaged_worker_uses_the_same_rust_validation_and_result_protocol() {
    use lmbox::{app::build_bundled_preview, contracts::PreviewRequest};
    use std::{
        path::Path,
        sync::{atomic::AtomicBool, Arc},
    };
    let request: PreviewRequest =
        serde_json::from_str(include_str!("../../../contracts/fixtures/v1/preview.json")).unwrap();
    let worker = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("resources/lmbox-geometry")
        .join(if cfg!(windows) {
            "lmbox-geometry.exe"
        } else {
            "lmbox-geometry"
        });
    let result =
        build_bundled_preview(&request, &worker, Arc::new(AtomicBool::new(false))).unwrap();
    assert_eq!(result["jobId"], request.job_id);
    assert_eq!(result["mesh"]["summary"]["holeCount"], 2);
    assert!(result["mesh"]["summary"]["volume"].as_f64().unwrap() > 0.0);
    assert!(
        build_bundled_preview(&request, &worker, Arc::new(AtomicBool::new(true)))
            .unwrap_err()
            .contains("取消")
    );
}
