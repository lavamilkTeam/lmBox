# 桌面 CFD 适配

先读[桌面说明](../agent-rust.md)和[CFD 协议](../../../contracts/schemas/v1/agent-contracts-cfd.md)。`cfd_request` 在阻塞工作线程调用核心 `CfdBackend` 的公开接口；宿主只定位可信配置与资源，不实现物理模型或复制任务版本逻辑。

`save_cfd_document` 只接收有界的 FCStd 文件字节，通过原生保存对话框写入用户选择的目标；取消返回 false。退出时关闭核心 CFD 会话，回收其原生资源。

开发环境通过项目内的 `.tools/cfd/runtime.json` 配置依赖。发布环境仅查找打包资源；没有运行时资源则明确不可用，不从前端接收可执行路径。桌面 IPC 编译通过不代表三个系统的 CFD 运行时已打包或验证。

验证执行桌面 fmt、Clippy、tests 及实际原生会话/保存操作；完整求解验证沿用核心 CFD 模块说明。

`choose_cfd_path` 从 Rust 当前快照核对文件对话框，再用系统选择器取得路径并经核心受信入口提交。前端仅发送工程/请求/版本和对话框标识；普通传输不接受路径或宿主授权标记。取消仍传递给原生对话框。
