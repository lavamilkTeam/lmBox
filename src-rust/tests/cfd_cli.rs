#![cfg(not(target_arch = "wasm32"))]
use serde_json::json;
use std::fs;
use std::io::Write;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[test]
fn eof_interrupts_pending_native_ack_and_removes_owned_session() {
    let directory = tempfile::tempdir().unwrap();
    let python = Command::new(if cfg!(windows) { "python" } else { "python3" })
        .args(["-c", "import sys;print(sys.executable)"])
        .output()
        .expect("Python protocol test interpreter");
    assert!(python.status.success());
    let engine = directory.path().join("engine");
    let package = engine.join("lmbox_geometry");
    fs::create_dir_all(&package).unwrap();
    fs::write(package.join("__init__.py"), "").unwrap();
    fs::write(package.join("cfd_worker.py"), "import sys,time,pathlib\nfor line in sys.stdin:\n pathlib.Path(__file__).with_name('pending').write_text(sys.argv[sys.argv.index('--session')+1])\n time.sleep(60)\n").unwrap();
    let source = directory.path().join("source");
    fs::create_dir_all(source.join("CfdOF")).unwrap();
    let config = directory.path().join("runtime.json");
    fs::write(&config, serde_json::to_vec(&json!({"schemaVersion":1,"sourceCommit":"a90f60c2313ceba09c236c81f0693d93357d1614","pythonExecutable":String::from_utf8(python.stdout).unwrap().trim(),"upstreamPath":source})).unwrap()).unwrap();
    let mut cli = Command::new(env!("CARGO_BIN_EXE_cfd"))
        .arg(config)
        .arg(engine)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut input = cli.stdin.take().unwrap();
    writeln!(input, "{}", json!({"schemaVersion":1,"projectId":"eof-test","requestId":"start","expectedRevision":0,"operation":"initialize","payload":{}})).unwrap();
    input.flush().unwrap();
    let pending = package.join("pending");
    let deadline = Instant::now() + Duration::from_secs(5);
    while !pending.is_file() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(10));
    }
    assert!(pending.is_file());
    let session = fs::read_to_string(pending).unwrap();
    drop(input);
    let deadline = Instant::now() + Duration::from_secs(8);
    let status = loop {
        if let Some(status) = cli.try_wait().unwrap() {
            break status;
        }
        if Instant::now() >= deadline {
            let _ = cli.kill();
            let _ = cli.wait();
            panic!("CLI did not cancel native ACK wait after EOF");
        }
        std::thread::sleep(Duration::from_millis(10));
    };
    assert!(status.success());
    assert!(!std::path::Path::new(&session).exists());
}
