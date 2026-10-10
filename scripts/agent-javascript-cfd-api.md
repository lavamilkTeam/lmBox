# CFD 开发传输

先读[构建工具说明](agent-javascript.md)和[CFD 协议](../contracts/schemas/v1/agent-contracts-cfd.md)。`cfd-api.ts` 只将同源、有上限的 HTTP JSON 请求转发给固定 Rust CLI；会话、版本和计算进程归 Rust 核心。

CLI 为按需启动的 JSONL 进程，通过工程/请求标识匹配响应；并发请求数、报文大小和响应等待均有上限。断开一次状态请求不会终止原生求解；开发服务关闭时先关闭 CLI 输入以清理会话，再回收未退出的 CLI。缺少运行环境或无效输出明确报错。

检查运行前端边界、类型、构建、平台适配测试及真实浏览器链路；不能把 HTTP 成功或操作入队等同于网格/求解成功。
