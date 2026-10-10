# 桌面 Rust：IPC 与原生保存

先读 [语言说明](../agent-rust.md)；维护规则与隐私要求见根规范。

## 职责与边界

范围：src/commands.rs。

仅为核心提供桌面适配，单向依赖 src-rust 的公开接口；不复制业务参数验证或制造算法。

## 行为约束

- `src/main.rs` 启动宿主；`src/commands.rs` 只适配 IPC、原生保存对话框、固定资源路径与窗口退出。业务、解析和计算调度留在核心，不在桌面入口复制校验规则。

- 前端只经 `frontend/platform/desktop` 导入 Tauri API。IPC 使用共享协议，不开放通用 shell、任意文件读取或由前端指定 worker 可执行路径的接口。

- `commands` 调用 `app::PreviewTasks` 登记任务，再运行核心业务；退出时取消全部任务，并在后台关闭 CFD 会话，等待实际进程回收后再退出。准备期间的取消不能丢失。

- 保存命令限制 json/stl/svg/dxf 和 32 MB，由用户选择目标；取消返回 false，写入失败返回错误。

## 验证

按 [打包说明](../agent-rust-packaging.md) 执行宿主 fmt/Clippy/tests 与搬移后的 worker 验证；三平台 GUI、签名和公证不能由编译结果推断。

宿主同时注册 [推进计算 IPC](agent-rust-propulsion.md)，模型任务和推进阻塞任务使用各自边界。
