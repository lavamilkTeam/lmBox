# CFD 原生运行库构建

先读[构建工具说明](../agent-javascript.md)、[运行时源码](../../runtime/agent-runtime.md)和[模块打包](../agent-javascript-modules.md)。本模块只管理第三方构建、依赖收集、加载路径与产物验证，不实现 CAD、网格或求解算法。组件命令与总包命令是 CLI 公开入口，内部文件不供业务模块导入。

当前构建配置支持 macOS arm64。源码来自 `runtime/` 固定版本；构建、SDK、安装产物分别放 `.tools/cfd/build`、`.tools/cfd/deps`、`.tools/cfd/install`。不修改系统安装或覆盖用户应用。FreeCAD、OpenFOAM、VTK 从源码编译；Python、Qt、OCCT 等依赖的二进制来源必须在组件清单中如实记录，不声称全部依赖都经过本项目源码编译。

- `freecad-dependencies.py` 使用固定锁准备独立 SDK；`freecad-build.py` 读取 `freecad-minimal.cmake` 构建当前 CfdOF 所需工作台及 GUI 核心；`freecad-pyside.py all` 从固定 PySide 6.8.3 源码回补官方 PYSIDE-3148 修复，仅重建保持原 ABI 的 libpyside，并通过 `freecad-pyside-regression.py` 公开 CLI 验证接收对象销毁后无关定时器连接仍有效。`freecad-package.py` 收集该回补库及 Qt、PySide、Python 等实际依赖，输出 `freecad/bin/python3`。`freecad-smoke.py` 验证搬移后的 CAD、网格、文档与公开 CFD 工作进程。
- `paraview.py` 的 `configure/build/install/audit/smoke` 使用 ParaView 固定版本中的 VTK 源码，仅启用字段提取所需模块与传递依赖。入口为 `paraview/bin/vtkpython`，不包含 ParaView 桌面程序、服务端通信或 Qt。此入口执行既有字段提取脚本，不冒充完整 ParaView 安装。
- `openfoam-runtime.py all` 协调固定源准备、编译、安装和搬移验证，`verify` 复查现有安装。`openfoam-build.py` 在独立副本应用 Darwin 构建修正；`openfoam-extensions.py` 构建 cfMesh、HiSA，`openfoam-openmp.py`、`openfoam-mpi.py` 和 `openfoam-parallel.py` 准备 OpenMP、MPI、Scotch 及适配库。安装根保留可搬移的 `etc/bashrc`，通过 `LMBOX_OPENFOAM_USER_DIR` 接受会话用户目录。实际命令、扩展与串并行能力以组件清单和真实求解验证为准。

`python3 scripts/bundle-cfd-runtime.py assemble` 从三个组件的 `runtime-manifest.json` 检查来源、平台和验证状态，组装 `.tools/cfd/bundle`。`check DIRECTORY` 验证来源、文件清单、权限、符号链接、Mach-O 架构及加载路径；最低 macOS 版本从全部实际二进制计算并写入清单，不能仅根据构建配置声明。`archive DIRECTORY OUTPUT.zip` 通过既有 ZIP 适配归档并写校验收据。已有输出不覆盖。包内路径相对，宿主绝对运行配置只在安装或执行 `setup-cfd.mjs --bundle DIRECTORY` 后生成。

验证从 CLI 和真实可搬移产物执行：`python3 scripts/bundle-cfd-runtime.check.py` 检查组装门禁；各组件执行自己的原生 smoke；`python3 scripts/check-cfd-runtime.py --bundle DIRECTORY` 搬移总包、隔离宿主环境后运行公开 CFD JSONL 会话、4 进程 Scotch 分区与 cavity 求解、cfMesh/HiSA 及新结果的 VTK 字段读取。可用 `--upstream`、`--engine` 指向解压模块中的源码，`--output` 保存无宿主路径的验证摘要。缺失原生库、未完成编译或失败测试必须明确失败，不能用模拟成功、宿主应用或旧缓存掩盖。跨语言检查遵循所属 Rust/Python 模块说明与根 `npm run check`。
