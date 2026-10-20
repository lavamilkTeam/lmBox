# 第三方运行时源码

本目录保存用于构建私有 CFD 运行时的上游源码。应用经 Rust/Python 的 CFD 适配入口调用；前端和业务模块不直接依赖上游源码内部文件。[原生构建与裁剪](../scripts/cfd-runtime/agent-python-cfd-runtime.md)管理 macOS arm64 构建、依赖和运行包，源码存在本身不代表构建或验证完成。

| 目录 | 固定版本 | 保存形式与许可证 |
| --- | --- | --- |
| `freecad/` | FreeCAD 1.1.3 | Git 子模块及其递归依赖；[LICENSE](freecad/LICENSE) |
| `paraview/` | ParaView 6.1.0 | Git 子模块及其递归依赖；[Copyright.txt](paraview/Copyright.txt) |
| `cfdof/` | `a90f60c2313ceba09c236c81f0693d93357d1614` | Git 子模块，与现有 CFD 适配版本一致；[LICENSE](cfdof/LICENSE) |
| `openfoam/` | OpenCFD OpenFOAM v2306 | 完整主仓库源码归档及可复现的 `source/`；[来源与校验](openfoam/source.json)、[COPYING](openfoam/COPYING) |

Git 子模块的精确提交由父仓库 gitlink 固定，官方来源见根目录 `.gitmodules`。获取其他工作副本中的源码使用 `git submodule update --init --recursive --depth 1 -- runtime/freecad runtime/paraview runtime/cfdof`；不要使用 `--remote` 隐式升级。保留上游源码、README、许可证及版权声明；所需功能通过构建选项选择，修改上游源码时维护独立补丁或可获取的固定提交。

OpenFOAM 原始归档含仅大小写不同的路径。`openfoam/OpenFOAM-v2306.tar.gz` 由固定提交执行 `git archive` 生成，保留大小写、权限和符号链接；`source.json` 固定来源、提交和 SHA-256。归档不包含 `.gitmodules` 引用的可选扩展源码；也不包含独立的 cfMesh-CfdOF、HiSA 或 ThirdParty 依赖源码。

在仓库根目录执行 `python3 scripts/prepare-openfoam-source.py`，将归档生成到 `openfoam/source/`。冲突名称在扩展名前追加数字：差异字符为大写的一侧加 `1`，小写一侧加 `0`；目录直接追加数字。处理范围包含同目录路径、`lnInclude` 汇集时的源码文件名和构建输出名称，引用与符号链接同步更新，C++ 类型名保持原义。README、许可证和版权文件内容保持原样。完整变换记录见 [case-map.json](openfoam/case-map.json)；归档、脚本与映射受版本管理，生成目录不重复提交。已有生成目录只校验，不覆盖本地修改。脚本入口与验证见 [CFD 环境准备](../scripts/agent-javascript-cfd.md)。

生成源码可存放在大小写不敏感的文件系统。`PDRFoam/flamePropagationWithObstacles` 教程执行时仍需要同时写入物理意义不同的 `B` 和 `b` 场；其 `Allrun` 在大小写敏感的算例目录还原场文件名，否则在求解前明确失败。源码改名不代表所有求解器运行数据都已消除大小写要求。

FreeCAD 按现有 CfdOF 控制器保留 GUI 核心、所需工作台及 Qt/PySide 依赖，通过构建选项和动态库闭包排除未用部分。后处理从 ParaView 的固定 VTK 源码构建读取与过滤模块，不包含 Qt、ParaView GUI 或服务端通信。Qt、Python 等配套库的来源和保留项记录于组件清单。适配行为见 [Python CFD 模块](../engine/src/lmbox_geometry/modules/cfd/agent-python-cfd.md)，分发行为见 [模块打包](../scripts/agent-javascript-modules.md)。

源码更新检查 gitlink、递归子模块状态、许可证及 OpenFOAM 归档哈希，并确认归档中的全部 Git blob、文件权限和符号链接与固定提交一致。生成目录使用 `python3 scripts/prepare-openfoam-source.py --check` 验证文件、权限、链接与映射；此校验要求干净的生成树，编译产生的文件或链接会被报告为额外路径。根检查使用 `npm run check`；上游原生编译、搬移验证和真实仿真须分别执行，不能由源码或前端检查替代。
