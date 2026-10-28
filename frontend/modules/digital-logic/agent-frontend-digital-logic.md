# 前端：数字逻辑电路

先读 [前端结构](../../agent-frontend.md)。`index.ts` 仅公开 `DigitalLogicWorkspace`；内部实现及状态不供其他领域模块访问。

| 内部范围 | 说明 |
| --- | --- |
| `lib/app` | [工作区协调](lib/app/agent-frontend-digital-logic-app.md) |
| `lib/features/circuit-editing` | [电路编辑功能](lib/features/circuit-editing/agent-frontend-circuit-editing.md) |
| `lib/features/circuit-simulation` | [仿真协调](lib/features/circuit-simulation/agent-frontend-circuit-simulation.md) |
| `lib/domain/circuit` | [电路草稿](lib/domain/circuit/agent-frontend-circuit.md) |
| `lib/ui` | [电路元件列表与画布](lib/ui/agent-frontend-digital-logic-ui.md) |

入口名称为“数字逻辑仿真”，支持 8 种逻辑门、输入开关、时钟、D 触发器、探针与 HD44780 的编辑和会话草稿。计算与器件状态由 [Rust 核心](../../../src-rust/src/modules/digital_logic/agent-rust-digital-logic.md) 拥有，经平台 Worker/WASM 会话返回四态电平、逻辑步数、LCD 文本及诊断；前端不重复求值。支持运行、暂停、单步和复位，不模拟模拟电压、真实传播延时或 HD44780 忙时序。浏览器与整包桌面通过应用公开入口加载；工程持久化与模块安装分发尚未接入。

运行 `npm run check`，feature 测试验证编辑规则和异步会话协调，浏览器测试通过真实 Rust/WASM 验证电平传播、边沿采样、状态保留与编辑交互。算法测试由 Rust 模块维护。
