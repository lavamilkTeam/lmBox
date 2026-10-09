# 桌面 Rust 结构与边界

先读 [根规范](../../AGENTS.md)、[Rust 核心](../../src-rust/agent-rust.md)，再读本目录模块；应用 `$code-boundary-standards`。改动 IPC 同时读 [前端适配](../../src/platform/desktop/agent-frontend-desktop.md) 与 [协议](../../contracts/agent-contracts.md)。

独立 Tauri crate：`src/main.rs` 启动，`src/commands.rs` 适配 IPC 与原生保存，配置/权限/资源管理打包。依赖方向为 `前端 platform → 宿主 commands → 核心公开入口`；核心不反向依赖 Tauri。

| 范围 | 必读说明 |
| --- | --- |
| `src/main.rs` | [宿主启动](src/agent-rust-host.md) |
| `src/commands.rs` | [IPC 与原生保存](src/agent-rust-commands.md) |
| `配置、权限、资源与安装器` | [打包](agent-rust-packaging.md) |

职责、接口和验证细节维护在对应模块；结构变化才更新本索引。全局推送与发布授权按根规范执行。
