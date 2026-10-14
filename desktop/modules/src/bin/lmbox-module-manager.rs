use lmbox_modules::{
    configure_cfd, default_root, install, installed, load_catalog, package_path, remove,
    trusted_key,
};
use serde_json::json;
use std::{io::Write, path::PathBuf};
fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let command = args.first().map(String::as_str).unwrap_or("status");
    let value = |flag: &str| {
        args.iter()
            .position(|s| s == flag)
            .and_then(|i| args.get(i + 1))
            .cloned()
    };
    let root = value("--root")
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(default_root)?;
    match command {
        "status" => println!(
            "{}",
            serde_json::to_string(&installed(&root)?).map_err(|e| e.to_string())?
        ),
        "catalog" => {
            let url = value("--catalog")
                .or_else(|| std::env::var("LMBOX_MODULE_CATALOG").ok())
                .or_else(|| {
                    option_env!("LMBOX_MODULE_CATALOG")
                        .filter(|v| !v.is_empty())
                        .map(str::to_owned)
                })
                .ok_or("请配置模块发布地址。")?;
            println!(
                "{}",
                serde_json::to_string(&load_catalog(&url, &trusted_key()?)?)
                    .map_err(|e| e.to_string())?
            );
        }
        "install" => {
            let url = value("--catalog")
                .or_else(|| std::env::var("LMBOX_MODULE_CATALOG").ok())
                .or_else(|| {
                    option_env!("LMBOX_MODULE_CATALOG")
                        .filter(|v| !v.is_empty())
                        .map(str::to_owned)
                })
                .ok_or("请配置模块发布地址。")?;
            let modules = value("--modules")
                .unwrap_or_default()
                .split(',')
                .filter(|s| !s.is_empty())
                .map(str::to_owned)
                .collect::<Vec<_>>();
            install(&root, &url, &trusted_key()?, &modules, |p| {
                println!("{}", serde_json::to_string(&p).unwrap());
                let _ = std::io::stdout().flush();
            })?;
        }
        "remove" => {
            let modules = value("--modules")
                .ok_or("请选择卸载模块。")?
                .split(',')
                .map(str::to_owned)
                .collect::<Vec<_>>();
            remove(&root, &modules)?;
            println!("{}", json!({"phase":"complete"}));
        }
        "configure-cfd" => {
            let python = value("--python").map(PathBuf::from);
            configure_cfd(&root, &installed(&root)?, python.as_deref())?;
        }
        "launch" => {
            let snapshot = installed(&root)?;
            let base = snapshot.packages.get("base").ok_or("基础程序尚未安装。")?;
            let native = package_path(&root, base).join("native");
            let executable = if cfg!(target_os = "macos") {
                native.join("lmBox.app/Contents/MacOS/lmbox-desktop")
            } else if cfg!(windows) {
                native.join("lmbox-desktop.exe")
            } else {
                native.join("lmbox-desktop")
            };
            std::process::Command::new(executable)
                .env("LMBOX_INSTALL_ROOT", &root)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        _ => return Err("未知模块管理操作。".into()),
    }
    Ok(())
}
fn main() {
    if let Err(message) = run() {
        println!("{}", json!({"phase":"error", "message":message}));
        std::process::exit(1);
    }
}
