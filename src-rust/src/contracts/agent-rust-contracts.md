# Rust：Rust 协议映射

先读 [语言说明](../../agent-rust.md)；维护规则与隐私要求见根规范。

## 职责与边界

映射 graphics v2、import v1、preview v1；后端 CEA v1 类型从 `contracts::thermochemistry` 公开，语义见 [CEA 协议](../../../contracts/schemas/v1/agent-contracts-cea.md)。`contracts::propulsion` 映射 [喷管/喷注器 v1](../../../contracts/schemas/v1/agent-contracts-propulsion.md)。`contracts::cfd` 定义原生 CFD 请求/响应、有限操作枚举与错误身份；状态为适配器的版本化 JSON 快照，工程版本由 Rust 持有。`mod.rs` 为公开类型入口。

来源见 [共享协议](../../../contracts/agent-contracts.md)，不依赖 app/features/runtime/Tauri，不泄漏解析 AST 或业务状态。变更时同步 schema、样例及受影响语言映射。

`contracts::ai` 映射 AI v1 的工程、请求、输入版本、能力、任务及产物描述；执行依赖和私有工作区不进入公共协议。错误响应保留请求身份，任务状态与结果由 [AI 模块](../modules/ai/agent-rust-ai.md) 管理。

Agent payload 的可选 `parentJobId` 语义由 [AI 协议](../../../contracts/schemas/v1/agent-contracts-ai.md) 维护；worker 历史上下文属于模块私有进程协议，不作为客户端请求类型公开。

## 验证

统一检查见 [语言说明](../../agent-rust.md#验证与维护)。经共享 schema/fixtures 验证序列化、未知版本、枚举、有限数值与兼容默认值。
