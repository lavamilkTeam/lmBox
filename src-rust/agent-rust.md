# Rust 核心结构与依赖边界

先读 [根规范](../AGENTS.md)，再读受影响模块；应用 `$code-boundary-standards`。跨界同时阅读 [前端](../src/agent-frontend.md)、[Python](../engine/agent-python.md)、[协议](../contracts/agent-contracts.md) 或 [桌面宿主](../desktop/tauri/agent-rust.md) 的相关说明。

## 结构与职责

单个业务核心 crate，按能力组织 feature；负责格式解析、业务校验和计算调用，不依赖 Tauri。当前已实现 Gerber/ZIP、WASM 导入、模型预览和导出业务入口；工程持久化、持久任务队列、STEP 与切片尚未实现，不创建无用占位模块。

`src/lib.rs` 为公开入口，`app` 组装，`browser.rs`/`bin` 是薄适配，`features` 管业务，`runtime` 管外部进程与文件，`contracts` 管类型。Python 负责制造几何；桌面 crate 负责窗口、IPC、原生对话框和资源打包。

## 依赖

`宿主 → 核心公开入口`；核心内部 `app → features/runtime/contracts`、`features → runtime 的窄公开接口/contracts`、`runtime → contracts`。feature 之间不相互导入，runtime 和 contracts 不反向依赖业务。可替换的外部能力由 app 注入，勿为每个函数建 trait。

各模块通过 `mod.rs` 声明最小接口，优先 `pub(crate)`；实现及测试保持私有。遵循 Rust 入口和 WASM 绑定的必要局部例外，不借此公开整个目录。不要建立通用 utils/services 容器。工程版本、任务策略和产物是否可用归业务；执行、超时和子进程回收归 runtime。

## 模块索引

| 范围 | 必读说明 |
| --- | --- |
| `src/app.rs、src/app/` | [业务组装与任务](src/app/agent-rust-app.md) |
| `src/browser.rs` | [WASM 接入](src/agent-rust-browser.md) |
| `src/bin/` | [本地预览 CLI](src/bin/agent-rust-preview-cli.md) |
| `src/features/board_import/` | [文件导入](src/features/board_import/agent-rust-board-import.md) |
| `src/features/board_import/parser/` | [Gerber 解析器](src/features/board_import/parser/agent-rust-parser.md) |
| `src/features/stencil/` | [建模业务验证](src/features/stencil/agent-rust-stencil.md) |
| `src/runtime/` | [计算进程与产物](src/runtime/agent-rust-python.md) |
| `src/contracts/` | [Rust 协议映射](src/contracts/agent-rust-contracts.md) |

## 验证与维护

在根目录运行 `cargo fmt --manifest-path src-rust/Cargo.toml --check`、`cargo clippy --manifest-path src-rust/Cargo.toml --locked --all-targets -- -D warnings`、`cargo test --manifest-path src-rust/Cargo.toml --locked`；需要真实计算时先配置几何环境。包含解析、协议、取消和真实 Python 集成测试；跨前端链路另运行 `npm run check`。文档只更新变化的所属模块；结构变化才更新本索引。不能把规划写成已实现或以本地检查替代远端质量门禁。
