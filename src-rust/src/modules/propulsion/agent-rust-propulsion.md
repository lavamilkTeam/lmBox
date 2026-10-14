# Rust：推进业务模块

先读 [Rust 说明](../../../agent-rust.md)。`mod.rs` 只导出 `CeaBackend`、`PropulsionBackend` 和对应错误；`app`、`features`、`runtime` 私有。根 `app` 保留宿主兼容转导出。

| 范围 | 说明 |
| --- | --- |
| `app/thermochemistry.rs` | [CEA 入口](app/agent-rust-thermochemistry.md) |
| `app/design.rs` | [喷管/喷注器入口](app/agent-rust-propulsion.md) |
| `features/thermochemistry/` | [CEA 请求校验](features/thermochemistry/agent-rust-thermochemistry.md) |
| `runtime/cea/` | [官方 CEA C ABI](runtime/cea/agent-rust-cea.md) |
| `runtime/design/` | [设计计算 C ABI](runtime/design/agent-rust-propulsion.md) |

Rust 管身份、协议、接口映射、调用协调和错误，不实现喷管/喷注器数值公式。热化学、性能、型面及水力计算属于 [Fortran 推进模块](../../../../src-fortran/modules/propulsion/agent-fortran-propulsion.md)。本模块只在原生目标启用，不依赖钢网模块、前端或桌面宿主。共享请求/结果留在根 `contracts`；跨业务不得导入本模块的内部路径。
