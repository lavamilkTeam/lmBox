# 桌面 Rust：宿主启动

先读 [语言说明](../agent-rust.md)；维护规则与隐私要求见根规范。

## 职责与边界

范围：src/main.rs。

仅为核心提供桌面适配，单向依赖 src-rust 的公开接口；不复制业务参数验证或制造算法。

## 行为约束

本目录是 lmBox 的桌面适配与打包入口。依赖方向为 `frontend/platform/desktop → commands → lmbox 核心公开入口`。核心库位于 `src-rust/`，不依赖桌面 crate，也不依赖 Tauri 或原生对话框。

## 验证

按 [打包说明](../agent-rust-packaging.md) 执行宿主 fmt/Clippy/tests 与搬移后的 worker 验证；三平台 GUI、签名和公证不能由编译结果推断。
