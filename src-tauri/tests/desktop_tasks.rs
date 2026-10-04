use lmbox::app::PreviewTasks;
use std::sync::atomic::Ordering;

#[test]
fn cancellation_before_start_is_preserved_and_capacity_is_released() {
    let tasks = PreviewTasks::default();
    tasks.prepare("project".into(), "first".into()).unwrap();
    assert!(tasks.prepare("project".into(), "first".into()).is_err());
    tasks.cancel("project", "first");
    assert!(tasks
        .start("project", "first")
        .unwrap()
        .load(Ordering::SeqCst));
    assert!(tasks.start("project", "first").is_err());
    tasks.prepare("other".into(), "first".into()).unwrap();
    assert!(tasks.prepare("third".into(), "first".into()).is_err());
    tasks.finish("project", "first");
    tasks.prepare("third".into(), "first".into()).unwrap();
    tasks.cancel_all();
    assert!(tasks.is_idle());
}

#[test]
fn shutdown_cancels_running_work_without_losing_the_process_owner() {
    let tasks = PreviewTasks::default();
    tasks.prepare("project".into(), "job".into()).unwrap();
    let flag = tasks.start("project", "job").unwrap();
    tasks.cancel_all();
    assert!(flag.load(Ordering::SeqCst));
    assert!(!tasks.is_idle());
    tasks.finish("project", "job");
    assert!(tasks.is_idle());
}

#[cfg(feature = "desktop")]
#[test]
fn packaged_worker_uses_the_same_rust_validation_and_result_protocol() {
    use lmbox::{app::build_bundled_preview, contracts::PreviewRequest};
    use std::{
        path::Path,
        sync::{atomic::AtomicBool, Arc},
    };
    let request: PreviewRequest =
        serde_json::from_str(include_str!("../../contracts/fixtures/v1/preview.json")).unwrap();
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
