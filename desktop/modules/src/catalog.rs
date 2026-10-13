use crate::Catalog;
use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::{Signature, VerifyingKey};
use serde::Deserialize;
use std::{fs, io::Read, time::Duration};
use url::Url;

pub fn target() -> String {
    let os = match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        other => other,
    };
    let arch = match std::env::consts::ARCH {
        "aarch64" => "arm64",
        "x86_64" => "x64",
        other => other,
    };
    format!("{os}-{arch}")
}
pub fn trusted_key() -> Result<[u8; 32], String> {
    let value = option_env!("LMBOX_MODULE_PUBLIC_KEY").unwrap_or("");
    hex::decode(value)
        .ok()
        .and_then(|b| b.try_into().ok())
        .ok_or_else(|| "安装程序尚未配置模块签名公钥，请重新构建安装器。".into())
}
pub(crate) fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(1800))
        .https_only(false)
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 {
                attempt.error("too many redirects")
            } else if attempt.url().scheme() != "https" {
                attempt.error("redirect requires HTTPS")
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|e| e.to_string())
}
pub(crate) fn source(url: &Url) -> Result<Box<dyn Read>, String> {
    match url.scheme() {
        "file" => Ok(Box::new(
            fs::File::open(url.to_file_path().map_err(|_| "本地源路径无效。")?)
                .map_err(|e| e.to_string())?,
        )),
        "https" => Ok(Box::new(
            client()?
                .get(url.clone())
                .send()
                .map_err(|e| e.to_string())?
                .error_for_status()
                .map_err(|e| e.to_string())?,
        )),
        "http" if matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]")) => {
            Ok(Box::new(
                client()?
                    .get(url.clone())
                    .send()
                    .map_err(|e| e.to_string())?
                    .error_for_status()
                    .map_err(|e| e.to_string())?,
            ))
        }
        _ => Err("模块下载源必须使用 HTTPS；本地验证可使用文件或回环地址。".into()),
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    payload: String,
    signature: String,
}
pub fn load_catalog(url: &str, key: &[u8; 32]) -> Result<Catalog, String> {
    let url = Url::parse(url).map_err(|_| "模块清单地址无效。")?;
    let mut bytes = Vec::new();
    source(&url)?
        .take(4 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 4 * 1024 * 1024 {
        return Err("模块清单超过大小限制。".into());
    }
    let envelope: Envelope = serde_json::from_slice(&bytes).map_err(|_| "模块清单格式无效。")?;
    let payload = STANDARD
        .decode(envelope.payload)
        .map_err(|_| "模块清单编码无效。")?;
    let signature = hex::decode(envelope.signature).map_err(|_| "模块签名无效。")?;
    let signature = Signature::from_slice(&signature).map_err(|_| "模块签名无效。")?;
    VerifyingKey::from_bytes(key)
        .map_err(|_| "签名公钥无效。")?
        .verify_strict(&payload, &signature)
        .map_err(|_| "模块清单签名校验失败。")?;
    let catalog: Catalog = serde_json::from_slice(&payload).map_err(|_| "模块清单内容无效。")?;
    catalog.validate()?;
    Ok(catalog)
}
