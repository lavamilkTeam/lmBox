# CFD 环境准备

先读 [构建工具说明](agent-javascript.md) 与 [Rust CFD 模块](../src-rust/src/modules/cfd/agent-rust-cfd.md)。

`setup-cfd.mjs` 只负责本地外部运行环境，不执行业务仿真。检测 FreeCAD 随附 Python 及 GUI 模块，探测使用独立临时用户目录。只从固定官方仓库获取固定 CfdOF commit，放入 `.tools/cfd/source`，原文件及许可证保持完整，来源写入 `.tools/cfd/source-manifest.json`。已有源版本或修改不匹配时失败，不覆盖本地改动。

运行配置 `.tools/cfd/runtime.json` 包含 `schemaVersion`、`sourceCommit`、`pythonExecutable`、`upstreamPath`，以及可选 `dockerExecutable`、`dockerImage`、`paraviewExecutable`。它是宿主可信配置，不透传给前端。脚本不修改用户 FreeCAD 插件、偏好或系统 Python 包。

可用环境变量为 `LMBOX_FREECAD_PYTHON` 或 `LMBOX_FREECAD_ROOT`、`LMBOX_CFD_DOCKER`、`LMBOX_CFD_DOCKER_IMAGE`、`LMBOX_CFD_PARAVIEW`；执行文件覆盖必须实际存在。未安装 Docker 时说明缺失，不能宣称网格/求解依赖就绪。默认镜像固定到经过真实求解验证的 CfdOF/OpenFOAM digest，可通过用户环境或已有可信配置覆盖；脚本不自动启动或拉取镜像。原版依赖检查仍报告镜像中低于上游要求的组件版本，不能因镜像可运行而屏蔽错误。

验证使用 `node --check scripts/setup-cfd.mjs`，并在已安装 FreeCAD 的环境执行实际准备流程；缺失环境的运行必须明确失败。原版资源分发仍保留其各自许可证。
