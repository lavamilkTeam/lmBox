# 桌面 Rust：推进计算 IPC

先读 [桌面 Rust](../agent-rust.md) 和 [核心推进模块](../../../src-rust/src/modules/propulsion/agent-rust-propulsion.md)。`propulsion.rs` 提供 `propulsion_run`，仅转换 IPC 并调用核心公开入口，不实现数值公式。

请求序列化上限 64 KiB；最多两个阻塞任务，由 RAII 在正常、错误或 panic 退出时归还计数。运行库路径由宿主确定，请求不得传路径。调试版使用仓库 `.tools/{propulsion,cea}/runtime`；发行版仅查找资源目录 `solvers/{propulsion,cea}/runtime`，缺少资源明确失败。现有安装包尚未复制或独立封装 Fortran 运行库，本次不宣称发行包已有此能力。

命令不维护工程状态；响应携带核心返回身份和版本，由调用方匹配。原生求解同步且没有取消接口，前端“停止等待”只丢弃响应，不宣称终止计算。

执行宿主 fmt/Clippy/tests 和 `npm run check`；前端 IPC 单测验证请求映射和停止等待，真实数值测试见核心模块。编译不能替代三平台 GUI 验证。
