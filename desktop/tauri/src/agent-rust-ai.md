# 桌面 Rust：AI 任务 IPC 与产物保存

先读 [桌面语言说明](../agent-rust.md) 和 [Rust AI 模块](../../../src-rust/src/modules/ai/agent-rust-ai.md)。

`ai.rs` 仅适配 `ai_request`、`save_ai_artifact` 和可信运行路径。两项命令调用核心 `AiBackend`；原生保存先取得该工程、任务、输入版本注册的产物，再通过用户选择的目标写盘。前端不提供任意源路径或二进制内容。用户取消返回 false，写盘失败返回错误。

开发解释器使用 `LMBOX_AI_PYTHON`，默认 `.tools/ai/venv`，源码入口固定为 `engine/src`；生产使用资源目录或可执行文件相邻 `ai/lmbox-ai`（Windows 为 `.exe`）的独立打包 worker。任务目录和空去重标记位于应用缓存下，重启保留标记但不恢复任务结果；退出时调用 `close_all()` 等待回收。模型与服务凭据由运行环境提供，不经 IPC 返回。

检查遵循 [打包说明](../agent-rust-packaging.md)。核心公共入口测试覆盖任务与二进制权限；编译检查不代表真实桌面文件选择、模型服务或三平台运行已验证。

模块版使用安装快照中的 ai-runtime，Video/Agent 各自检查安装状态；缺少 AI 包不阻止基础程序启动。
