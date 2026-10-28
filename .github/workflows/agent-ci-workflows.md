# CI：检查与发布工作流

先读 [CI 说明](../agent-ci.md) 和受影响语言说明；工作流改动应用 `$code-boundary-standards`。

`ci.yml` 运行前端、Rust、Python、桌面矩阵、Fortran CEA 与推进设计库三平台矩阵和工作流检查，`Quality gate` 仅全部成功才放行；失败、取消或跳过不能通过。`release.yml` 使用完整门禁后校验并发布安装器。执行与发布细节见 [质量规范](../QUALITY.md)。

不得通过 path filter、跳过测试、弱化边界或忽略错误获得绿色状态。Actions、工具链和依赖版本按现有约定固定；凭证不进入构建/测试。远端 required checks 需核对实际绑定，配置文件不能证明设置生效。运行 actionlint 与受影响的本地检查；三平台与 Release 以实际 hosted run 为准。

前端任务安装 GNU Fortran/CMake/Ninja 并构建本地后端，以真实推进计算运行浏览器集成测试。

前端任务另执行 `npm run cloud:package` 验证独立云网页构建与归档，并上传 `cloud-web` 构建产物；产物边界见[云网页打包](../../scripts/cloud/agent-javascript-cloud.md)。桌面矩阵通过 `npm run desktop:archive` 归档原生程序，两类产物使用独立输出目录。

Rust 门禁固定 Node 24，验证真实 Node 协议夹具与宿主工具；前端门禁验证 ConeCode worker 到 Rust 的完整链路。Python 门禁安装 AI extra 验证 LangGraph 工具循环；桌面矩阵另打包并搬移检查 Python worker 和 ConeCode Node runtime。AI 检查使用本机可辨识模型服务替身，不接收云端凭据，不声称验证实际云端推理。

Python 门禁同时检查 CFD 构建脚本的 Ruff；工作流任务验证 OpenFOAM 源码转换及固定归档生成的大小写映射，macOS 桌面任务用微型 Mach-O 夹具验证 CFD 包装与搬移门禁。这些检查不编译完整 CFD 原生运行库；组件和总包的实际仿真验证见[原生构建说明](../../scripts/cfd-runtime/agent-python-cfd-runtime.md)。

桌面矩阵另执行独立模块分发 crate 的 fmt/Clippy/tests，以及宿主 modular 特性的 Clippy；构建五个可选模块 ZIP、基础与共享运行库包及 Qt 下载安装器。实际 ZIP 解压搬移后执行 geometry/AI/Fortran 检查和安装器 QML 启动测试。模块 ZIP 发布构建与签名配置见[模块构建](../../scripts/desktop/agent-javascript-modules.md)。Release 下载本次运行的整包和模块产物，校验完整性、公钥与来源后，仅在发布任务读取私钥签名 catalog，再一起上传；缺少固定签名配置时拒绝发布。

Linux Qt 6.8.3 SDK 必须同时安装官方 `icu` archive，不能用系统 ICU 74 替代其 ICU 73 ABI；安装后执行 `qmake -query QT_VERSION`，缺少动态依赖时立即失败。归档安装器启动检查清除外部 Qt/QML 和动态库搜索路径，Linux 使用 Xvfb 加载实际部署的 `xcb` 平台插件，并验证三个 ICU 73 库均解析到解压目录内部。`xcb` 系统依赖必须包含 `libxcb-cursor0`、`libxcb-icccm4`、`libxcb-keysyms1`、`libxcb-shape0` 与 `libxkbcommon-x11-0`；启动前单独对归档内 `libqxcb.so` 执行 `ldd`，缺库直接失败，不能只检查主程序而遗漏动态加载的插件。Windows 编译器运行库许可证从 MSYS2 的 `libgcc`、`libgfortran`、`libquadmath`、`libstdc++` 和 `libwinpthread` 包目录收集，任一目录缺失均使构建失败。

Windows 归档求解器验证从复制后的环境字典读取大写 `SYSTEMROOT`，只保留系统目录组成的 `PATH`；普通字典不具备 Windows `os.environ` 的大小写无关访问行为，不能使用混合大小写键或回退到含编译器路径的原环境。

前端任务还构建独立 Agent 网页归档，执行真实 HTTP 宿主、Rust 工具和 Node worker 的搬移链路测试（模型为明确夹具），上传 `agent-web-linux-x64`。详见 [Agent 网页发布](../../scripts/web-agent/agent-javascript-web-agent.md)。
