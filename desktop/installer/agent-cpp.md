# Qt 安装器结构与边界

先读[总规范](../../AGENTS.md)并应用 `$code-boundary-standards`。本目录是独立 Qt Quick 安装欢迎程序，不依赖 Tauri、Rust 业务核心、Python 或 HTTP 服务。

| 范围 | 职责 |
| --- | --- |
| `src/main.cpp` | 创建 Qt 应用、选择 Basic 控件样式、加载内嵌 QML，处理加载失败和 `--reduce-motion` 参数 |
| `ui/Welcome.qml`、`ui/ModuleSelection.qml` | [欢迎画面、模块选择和动画](ui/agent-qml-welcome.md) |
| `CMakeLists.txt` | 编译 C++/QML、嵌入素材、部署 Qt 依赖 |

调用方向为宿主加载 UI，欢迎页组合模块选择弹层。勾选状态仅保存在 UI 会话中，宿主尚未连接安装业务，不下载、执行安装或伪报安装完成。外部系统交互在实际接入时归宿主适配，不写进 QML。

素材复用 `frontend/ui/installer-welcome/lib/assets` 的 GIF、静止帧及字体；这是构建时静态资源输入，不导入前端实现。Qt 使用 TTF 子集，Web 使用同源 WOFF2；许可证随资源及分发目录保留。

构建入口见[安装构建说明](../../scripts/agent-javascript-installer.md)。验证 `npm run installer:package`、`cmake --build .tools/installer-qt --target all_qmllint`，并实际打开打包程序检查显示、动画及关闭。跨平台源码不等于 Windows/Linux 打包或 GUI 已验证。
