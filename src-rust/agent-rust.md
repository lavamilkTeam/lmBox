# Rust 核心结构与依赖边界

先读 [根规范](../AGENTS.md)，再读受影响模块；应用 `$code-boundary-standards`。跨界同时阅读 [前端](../frontend/agent-frontend.md)、[Python](../engine/agent-python.md)、[协议](../contracts/agent-contracts.md) 或 [桌面宿主](../desktop/tauri/agent-rust.md) 的相关说明。

## 结构与职责

单个业务核心 crate，先按业务域划分 `src/modules/stencil`、`src/modules/propulsion`，再在模块内按职责组织 `features`、`app` 和 `runtime`。每个模块通过自己的 `mod.rs` 提供窄公开入口，内部目录不对外公开；不依赖 Tauri，不为未来能力建立空模块。

`src/lib.rs` 为 crate 入口；`browser.rs`/`bin` 为薄适配；根 `app.rs` 和 `parse_gerber` 仅保留既有宿主兼容转导出。共享数据类型留在 `contracts`。Rust 管格式解析、业务身份、协议及计算调用；制造几何归 Python 钢网模块，热化学和喷管/喷注器数值计算归 Fortran 推进模块。桌面 crate 管窗口、IPC、对话框和资源打包。

## 依赖

`宿主/CLI → modules/<业务>/mod.rs → app → features/runtime → contracts`。模块之间不导入内部 feature/runtime；实际跨业务流程由外层应用协调，经公开入口组合。各模块内部 feature 依赖单向无环，runtime/contracts 不反向依赖业务。共享协议不能成为业务算法容器。

只为实际用例添加模块和 feature；业务域是完整能力边界，feature 是其内部用例。可替换外部能力在真实调用边界注入，不机械地为每个函数建 trait。Rust 的模块可见性保护私有实现；WASM 与原生通过条件编译隔离。

## 模块索引

| 范围 | 必读说明 |
| --- | --- |
| `src/modules/stencil/` | [钢网模块及内部索引](src/modules/stencil/agent-rust-stencil.md) |
| `src/modules/propulsion/` | [推进模块及内部索引](src/modules/propulsion/agent-rust-propulsion.md) |
| `src/browser.rs` | [WASM 接入](src/agent-rust-browser.md) |
| `src/bin/` | [开发 CLI](src/bin/agent-rust-preview-cli.md) |
| `src/contracts/` | [共享协议映射](src/contracts/agent-rust-contracts.md) |

## 验证与维护

在根目录运行 `cargo fmt --manifest-path src-rust/Cargo.toml --check`、`cargo clippy --manifest-path src-rust/Cargo.toml --locked --all-targets -- -D warnings`、`cargo test --manifest-path src-rust/Cargo.toml --locked`；需要真实计算时先配置几何环境。包含解析、协议、取消和真实 Python 集成测试；跨前端链路另运行 `npm run check`。文档只更新变化的所属模块；结构变化才更新本索引。不能把规划写成已实现或以本地检查替代远端质量门禁。
