# Rust：钢网业务模块

先读 [Rust 说明](../../../agent-rust.md)。外部只调用本目录 `mod.rs` 导出的导入、解析、预览校验和原生预览/任务入口；`features`、`app`、`runtime` 均为私有模块。

| 范围 | 说明 |
| --- | --- |
| `features/board_import/` | [导入与解析](features/board_import/agent-rust-board-import.md) |
| `features/modeling/` | [建模请求校验](features/modeling/agent-rust-stencil.md) |
| `app/` | [用例与任务协调](app/agent-rust-app.md) |
| `runtime/` | [Python 进程适配](runtime/agent-rust-python.md) |

依赖为 `app → features/runtime → contracts`；feature 不相互导入。制造几何仍由 Python 钢网模块执行，不依赖推进模块。WASM 只包含导入/协议部分，原生 app/runtime 使用平台条件编译。根 `app` 和 `parse_gerber` 保留已有宿主兼容入口，但不拥有实现。测试通过模块公开入口或兼容入口执行。
