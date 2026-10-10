# JavaScript：推进计算开发适配

先读 [构建工具](agent-javascript.md)。`propulsion-api.ts` 在 Vite dev/preview 注册固定 `/api/propulsion`，只接受同源 JSON POST。由宿主决定 CLI 和运行库路径，不接受请求指定命令或路径；数值计算归 Rust/Fortran。

最多两个进程，请求 64 KiB、结果 2 MiB、诊断 4 KiB、执行 60 秒。客户端断开、超时、输出超限或服务器关闭均终止子进程；退出事件回收并发计数。原生非零退出返回可见错误，不回退示例结果。需先 `npm run build:backend`；缺少引擎明确报错，静态托管不包含计算能力。

执行 `npm run check`，真实端到端测试覆盖原生 CLI、非法输入、迟到响应和导出。
