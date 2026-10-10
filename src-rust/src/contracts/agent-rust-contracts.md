# Rust：Rust 协议映射

先读 [语言说明](../../agent-rust.md)；维护规则与隐私要求见根规范。

## 职责与边界

映射 graphics v2、import v1、preview v1；后端 CEA v1 类型从 `contracts::thermochemistry` 公开，语义见 [CEA 协议](../../../contracts/schemas/v1/agent-contracts-cea.md)。`contracts::propulsion` 映射 [喷管/喷注器 v1](../../../contracts/schemas/v1/agent-contracts-propulsion.md)。`mod.rs` 为公开类型入口。

来源见 [共享协议](../../../contracts/agent-contracts.md)，不依赖 app/features/runtime/Tauri，不泄漏解析 AST 或业务状态。变更时同步 schema、样例及受影响语言映射。

## 验证

统一检查见 [语言说明](../../agent-rust.md#验证与维护)。经共享 schema/fixtures 验证序列化、未知版本、枚举、有限数值与兼容默认值。
