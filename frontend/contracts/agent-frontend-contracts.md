# 前端：前端协议映射

先读 [语言说明](../agent-frontend.md)；维护规则与隐私要求见根规范。

## 职责与边界

`index.ts` 暴露 graphics/import/preview 类型。协议来源见 [共享协议](../../contracts/agent-contracts.md)。

不依赖应用、feature、平台、状态或 UI。当前是手工映射及共享样例校验，未建立自动类型生成；不能将映射描述为生成代码。

## 行为约束

- `contracts/index.ts` 是前端协议的公开入口；协议层不得依赖业务模块。当前类型手工映射 graphics v2，Rust 测试校验示例 JSON 与解析输出一致；尚无三端自动类型生成。

## 验证

统一检查见 [语言说明](../agent-frontend.md#验证与维护)。核对共享 fixtures 与 Rust/Python 映射的类型、单位、版本和拒绝行为。

`propulsion.ts` 手工映射喷管/喷注器 v1 及内嵌 CEA 火箭结果；SI 字段和任务身份保持后端语义。平台边界校验响应类型、身份、版本、有限数值和图形数组后交给模块。

`cfd.ts` 手工映射 CFD 会话、原生控件与几何投影；Rust 版本和请求身份按共享 CFD 协议匹配，翻译不改变原生选项值。
