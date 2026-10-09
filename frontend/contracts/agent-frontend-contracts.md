# 前端：前端协议映射

先读 [语言说明](../agent-frontend.md)；维护规则与隐私要求见根规范。

## 职责与边界

`index.ts` 暴露 graphics/import/preview 类型。协议来源见 [共享协议](../../contracts/agent-contracts.md)。

不依赖应用、feature、平台、状态或 UI。当前是手工映射及共享样例校验，未建立自动类型生成；不能将映射描述为生成代码。

## 行为约束

- `contracts/index.ts` 是前端协议的公开入口；协议层不得依赖业务模块。当前类型手工映射 graphics v2，Rust 测试校验示例 JSON 与解析输出一致；尚无三端自动类型生成。

## 验证

统一检查见 [语言说明](../agent-frontend.md#验证与维护)。核对共享 fixtures 与 Rust/Python 映射的类型、单位、版本和拒绝行为。
