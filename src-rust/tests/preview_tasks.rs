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
