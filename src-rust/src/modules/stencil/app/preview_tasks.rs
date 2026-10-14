use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

type Identity = (String, String);
struct Task {
    cancelled: Arc<AtomicBool>,
    running: bool,
    created: Instant,
}

/// Two-phase registration makes cancellation reliable even before computation starts.
#[derive(Default)]
pub struct PreviewTasks(Mutex<HashMap<Identity, Task>>);
impl PreviewTasks {
    pub fn prepare(&self, project: String, job: String) -> Result<(), String> {
        if project.is_empty() || job.is_empty() || project.len() > 200 || job.len() > 200 {
            return Err("任务标识无效。".into());
        }
        let mut tasks = self.0.lock().map_err(|_| "任务状态不可用。")?;
        tasks.retain(|_, task| task.running || task.created.elapsed() < Duration::from_secs(60));
        let key = (project, job);
        if tasks.contains_key(&key) {
            return Err("任务已存在。".into());
        }
        if tasks.len() >= 2 {
            return Err("已有两个模型任务运行，请稍后重试。".into());
        }
        tasks.insert(
            key,
            Task {
                cancelled: Arc::new(AtomicBool::new(false)),
                running: false,
                created: Instant::now(),
            },
        );
        Ok(())
    }
    pub fn start(&self, project: &str, job: &str) -> Result<Arc<AtomicBool>, String> {
        let mut tasks = self.0.lock().map_err(|_| "任务状态不可用。")?;
        let task = tasks
            .get_mut(&(project.into(), job.into()))
            .ok_or("任务未登记或已过期。")?;
        if task.running {
            return Err("任务已启动。".into());
        }
        task.running = true;
        Ok(Arc::clone(&task.cancelled))
    }
    pub fn cancel(&self, project: &str, job: &str) {
        if let Ok(tasks) = self.0.lock() {
            if let Some(task) = tasks.get(&(project.into(), job.into())) {
                task.cancelled.store(true, Ordering::SeqCst);
            }
        }
    }
    pub fn finish(&self, project: &str, job: &str) {
        if let Ok(mut tasks) = self.0.lock() {
            tasks.remove(&(project.into(), job.into()));
        }
    }
    pub fn cancel_all(&self) {
        if let Ok(mut tasks) = self.0.lock() {
            tasks.retain(|_, task| {
                task.cancelled.store(true, Ordering::SeqCst);
                task.running
            });
        }
    }
    pub fn is_idle(&self) -> bool {
        self.0.lock().map(|tasks| tasks.is_empty()).unwrap_or(true)
    }
}
