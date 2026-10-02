use std::{
    io::{self, BufRead, Read},
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

fn main() {
    let mut line = String::new();
    let result = (|| {
        io::stdin()
            .lock()
            .take(12 * 1024 * 1024 + 1)
            .read_line(&mut line)
            .map_err(|e| e.to_string())?;
        if line.len() > 12 * 1024 * 1024 {
            return Err("模型请求过大。".to_string());
        }
        let request = serde_json::from_str(&line).map_err(|_| "模型请求格式无效。".to_string())?;
        let cancelled = Arc::new(AtomicBool::new(false));
        let cancel = cancelled.clone();
        // The browser adapter closes stdin on abort. The owner then kills and reaps Python.
        std::thread::spawn(move || {
            let _ = io::stdin().read(&mut [0]);
            cancel.store(true, Ordering::SeqCst);
        });
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("repository root");
        lmbox::app::build_preview(&request, root, cancelled)
    })();
    let response = result.unwrap_or_else(|error| serde_json::json!({"error":error}));
    println!("{response}");
}
