# Qt 安装器结构与边界

先读[总规范](../../AGENTS.md)并应用 `$code-boundary-standards`。本目录是独立 Qt Quick 安装程序；通过独立的原生模块管理 CLI 接入分发，不依赖 Tauri、Rust 业务核心或 Python 计算入口。

| 范围 | 职责 |
| --- | --- |
| `src/InstallController.h/cpp` | 通过 QProcess 调用模块管理 CLI，接收签名清单与 JSONL 进度，执行安装、取消和启动 |
| `src/main.cpp` | 创建 Qt 应用、选择 Basic 控件样式、加载内嵌 QML，处理加载失败和 `--reduce-motion` 参数 |
| `ui/Welcome.qml`、`ui/ModuleSelection.qml` | [欢迎画面、模块选择和动画](ui/agent-qml-welcome.md) |
| `CMakeLists.txt` | 编译 C++/QML、嵌入素材、部署 Qt 依赖 |

调用方向为宿主加载 UI，欢迎页组合模块选择弹层。勾选状态保存在 UI 会话中；控制器调用[原生模块管理](../modules/agent-rust.md)获取已签名的发布目录、下载 ZIP 并安装到用户数据目录。QML 仅发送选择与操作，不访问网络或磁盘。只有 CLI 正常完成才显示安装完成；下载错误、签名失败、取消和缺少发布配置均呈现真实状态。基础程序与依赖由管理程序自动选择，补装保留已安装功能。

素材复用 `frontend/ui/installer-welcome/lib/assets` 的 GIF、静止帧及字体；这是构建时静态资源输入，不导入前端实现。Qt 使用 TTF 子集，Web 使用同源 WOFF2；许可证随资源及分发目录保留。

构建入口见[安装构建说明](../../scripts/desktop/agent-javascript-installer.md)。验证 `npm run installer:package`、`cmake --build .tools/installer-qt --target all_qmllint`，并实际打开打包程序检查显示、动画及关闭。跨平台源码不等于 Windows/Linux 打包或 GUI 已验证。

`--smoke-test` 在真实加载 QML 根界面后退出，根对象不存在时返回失败；CI 将安装器解压到新目录，清除外部 Qt/QML 搜索路径后检查部署依赖，Linux 使用 Xvfb 加载包内 `xcb` 平台插件。该检查不代表交互和动画已通过人工验收。
