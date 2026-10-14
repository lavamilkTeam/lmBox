# Rust：CFD 原生会话

先读 [Rust 语言说明](../../../agent-rust.md) 与 [Python CFD 适配](../../../../engine/src/lmbox_geometry/modules/cfd/agent-python-cfd.md)。

## 职责与公开入口

`mod.rs` 只公开 `CfdBackend`。宿主以可信运行配置与引擎目录构造 `CfdBackend::new`，通过同步 `request(CfdRequest) -> CfdResponse` 调用；`close_all()` 终止宿主生命周期并释放全部会话，关闭后需新建 backend 才可启动会话。类型来自 `contracts::cfd`，不依赖桌面 IPC。桌面阻塞线程与持久 CLI 共用此入口。`select_dialog_path(request, path)` 仅供桌面宿主真实选择器使用：请求只携带活动对话框标识，Rust 验证原生选择模式后发送独立的受信任选择；普通传输不能携带路径或伪造信任标记。

`app` 拥有工程会话、版本递增、过期变更拒绝及输入校验；`runtime` 私有实现 FreeCAD 进程、JSONL、日志和临时文件。依赖方向为 `宿主 → 公共入口 → app → runtime/contracts`，原版 CfdOF 控制器属于 Python 外部适配，不成为 Rust 公共类型。

## 会话与边界

最多两个工程会话，每个会话串行操作且拥有独立临时目录、用户配置及原版源副本。首次成功初始化版本从 0 增为 1；成功接收变更时递增，查询/导出保持版本，响应同时返回请求输入版本。原生操作可能异步完成，后续查询返回 `lastAction`，不能把 ACK 当作求解完成。超时变更保守递增版本，普通查询超时保留工作进程。

宿主配置由 [环境准备脚本](../../../../scripts/agent-javascript-cfd.md) 生成，不接受前端提供解释器、路径或源码。操作参数严格限定键。导入只接受文件名与 Base64，Rust 写入会话 `imports`；导出只读取固定 `session.FCStd` 并返回名称与 Base64。产物在响应顶层 `artifact` 返回，未初始化失败省略 `state`。文件上限 24 MiB，Base64 上限 32 MiB，请求/工作进程单帧上限 36 MiB，stderr 尾部上限 64 KiB。启动响应最多等待 90 秒，后续 ACK/查询等待 30 秒。显式关闭与宿主 EOF 清理会话；EOF 通过独立输入线程唤醒等待，并并行回收两个会话，超出宽限期终止进程组与该会话独占容器；不会调用全局 killall。

`bin/cfd.rs [运行配置] [引擎源码目录]` 是持久 JSONL 薄入口，每行读取请求并返回一行响应，直到 stdin EOF。默认路径为 `.tools/cfd/runtime.json` 和 `engine/src`。环境缺失及原生错误明确失败，不返回示例状态冒充结果。

## 验证

公共入口测试使用隔离的协议工作进程，覆盖版本/错误关联、会话数量、路径拒绝与文件往返；不加载私有算法。真实 FreeCAD 适配检查见 Python 模块。修改后运行 Rust 格式、clippy 和测试；跨端运行根规范指定的完整检查。
