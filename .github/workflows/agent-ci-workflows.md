# CI：检查与发布工作流

先读 [CI 说明](../agent-ci.md) 和受影响语言说明；工作流改动应用 `$code-boundary-standards`。

`ci.yml` 运行前端、Rust、Python、桌面矩阵、Fortran CEA 与推进设计库三平台矩阵和工作流检查，`Quality gate` 仅全部成功才放行；失败、取消或跳过不能通过。`release.yml` 使用完整门禁后校验并发布安装器。执行与发布细节见 [质量规范](../QUALITY.md)。

不得通过 path filter、跳过测试、弱化边界或忽略错误获得绿色状态。Actions、工具链和依赖版本按现有约定固定；凭证不进入构建/测试。远端 required checks 需核对实际绑定，配置文件不能证明设置生效。运行 actionlint 与受影响的本地检查；三平台与 Release 以实际 hosted run 为准。

前端任务安装 GNU Fortran/CMake/Ninja 并构建本地后端，以真实推进计算运行浏览器集成测试。

Python 门禁安装 AI extra 验证 LangGraph 工具循环；桌面矩阵另打包并搬移检查独立 AI worker。AI 检查使用本机可辨识模型服务替身，不接收云端凭据，不声称验证实际云端推理。

桌面矩阵另执行独立模块分发 crate 的 fmt/Clippy/tests，以及宿主 modular 特性的 Clippy；构建五个可选模块 ZIP、基础与共享运行库包及 Qt 下载安装器。实际 ZIP 解压搬移后执行 geometry/AI/Fortran 检查和安装器 QML 启动测试。模块 ZIP 发布构建与签名配置见[模块构建](../../scripts/agent-javascript-modules.md)。Release 下载本次运行的整包和模块产物，校验完整性、公钥与来源后，仅在发布任务读取私钥签名 catalog，再一起上传；缺少固定签名配置时拒绝发布。

Linux Qt 6.8.3 SDK 必须同时安装官方 `icu` archive，不能用系统 ICU 74 替代其 ICU 73 ABI；安装后执行 `qmake -query QT_VERSION`，缺少动态依赖时立即失败。归档安装器启动检查清除外部 Qt/QML 和动态库搜索路径，Linux 另验证三个 ICU 73 库均解析到解压目录内部。Windows 编译器运行库许可证从 MSYS2 的 `libgcc`、`libgfortran`、`libquadmath`、`libstdc++` 和 `libwinpthread` 包目录收集，任一目录缺失均使构建失败。
