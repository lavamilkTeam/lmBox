# CFD 环境准备

先读 [构建工具说明](agent-javascript.md) 与 [Rust CFD 模块](../src-rust/src/modules/cfd/agent-rust-cfd.md)。

`setup-cfd.mjs` 只负责本地外部运行环境，不执行业务仿真。检测 FreeCAD 随附 Python 及 GUI 模块，探测使用独立临时用户目录。只从固定官方仓库获取固定 CfdOF commit，放入 `.tools/cfd/source`，原文件及许可证保持完整，来源写入 `.tools/cfd/source-manifest.json`。已有源版本或修改不匹配时失败，不覆盖本地改动。

`node scripts/setup-cfd.mjs --source-only` 为模块发布构建只获取并校验上述固定源码与许可证；不探测外部程序、不创建或更新 runtime.json，也不宣称运行环境已就绪。常规 `setup:cfd` 优先验证已有 `.tools/cfd/bundle`，未构建本地包时才探测宿主环境。

`prepare-openfoam-source.py` 是独立的第三方源码准备入口，只使用 Python 标准库。默认读取 `runtime/openfoam/source.json`，先校验归档哈希，再生成大小写安全的 `source/` 和 `case-map.json`；命名规则与运行限制见 [运行时源码](../runtime/agent-runtime.md)。`--metadata` 接受其他来源清单路径，`--check` 校验既有生成结果；普通执行遇到已有目录也只校验，发现修改时失败。此入口不调用仿真、不修改宿主配置，不依赖计算引擎内部模块。

运行配置 `.tools/cfd/runtime.json` 包含 `schemaVersion`、`sourceCommit`、`pythonExecutable`、`upstreamPath`，以及可选 `dockerExecutable`、`dockerImage`、`paraviewExecutable`。它是宿主可信配置，不透传给前端。脚本不修改用户 FreeCAD 插件、偏好或系统 Python 包。

`node scripts/setup-cfd.mjs --bundle DIRECTORY`（或 `LMBOX_CFD_BUNDLE`）覆盖默认包位置，使用[原生构建模块](cfd-runtime/agent-python-cfd-runtime.md)生成的运行库，检查平台、最低 macOS 版本、固定入口和 FreeCAD 可用性后写入 `pvpythonExecutable`、`openfoamDirectory`；此模式不继承旧 Docker 或外部 ParaView 配置，已有包验证失败时清除旧运行配置，不回退宿主。`pvpythonExecutable` 可指向随包的 VTK Python 脚本解释器，完整 ParaView GUI 仍使用独立的 `paraviewExecutable`。本地 OpenFOAM 与 Docker 求解配置互斥。

可用环境变量为 `LMBOX_FREECAD_PYTHON` 或 `LMBOX_FREECAD_ROOT`、`LMBOX_CFD_DOCKER`、`LMBOX_CFD_DOCKER_IMAGE`、`LMBOX_CFD_PARAVIEW`；执行文件覆盖必须实际存在。未安装 Docker 时说明缺失，不能宣称网格/求解依赖就绪。默认镜像固定到经过真实求解验证的 CfdOF/OpenFOAM digest，可通过用户环境或已有可信配置覆盖；脚本不自动启动或拉取镜像。原版依赖检查仍报告镜像中低于上游要求的组件版本，不能因镜像可运行而屏蔽错误。

验证使用 `node --check scripts/setup-cfd.mjs`，并在已安装 FreeCAD 的环境执行实际准备流程；缺失环境的运行必须明确失败。源码转换通过 `python3 -B scripts/prepare-openfoam-source.check.py -v` 从 CLI 验证改名、引用、构建输出、链接、权限、文档保留、拒绝路径越界及不覆盖本地修改；真实生成树另执行 `python3 scripts/prepare-openfoam-source.py --check`。原版资源分发仍保留其各自许可证。
