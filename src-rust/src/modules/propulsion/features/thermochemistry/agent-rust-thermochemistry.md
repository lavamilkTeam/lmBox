# Rust：热化学业务校验

先读 [Rust 说明](../../../../../agent-rust.md)。`mod.rs` 的 crate 内入口校验 thermochemistry v1 请求，不访问文件、不调用原生库。

约束包括协议版本、任务身份、有限正数、1–32 个互异标准 CEA 物种、质量分数和为 1，以及 1–32 个递增且大于 1 的超声速出口面积比。物种是否存在及入口温度是否在数据库范围内由原生适配查询。

公开计算用例由 [app](../../app/agent-rust-thermochemistry.md) 组装；协议语义见 [CEA v1](../../../../../../contracts/schemas/v1/agent-contracts-cea.md)。通过 app 的真实集成测试验证非法输入和错误后恢复，不公开私有校验实现供宿主调用。
