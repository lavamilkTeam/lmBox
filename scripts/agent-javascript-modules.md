# 模块 ZIP 发布构建

先读[构建工具说明](agent-javascript.md)、[安装管理边界](../desktop/modules/agent-rust.md)与[桌面打包](../desktop/tauri/agent-rust-packaging.md)。`module-package.mjs` 只组装构建产物、划分资源归属并签名；`module-archive.py` 是保留权限和符号链接的 ZIP 文件适配，不包含安装业务或计算算法。

## 入口与产物

- `npm run modules:prepare`：准备签名配置并编译原生安装管理程序；Qt 构建自动调用。
- `npm run modules:package`：构建前端 manifest、启用桌面 `modular` 特性构建基础程序，再创建模块 ZIP 和签名目录。
- `npm run modules:archive`：对已经构建的模块版主程序与运行库创建 ZIP。

输入须先准备真实运行库：`build:worker`、`build:ai-worker`、`build:backend` 和 `setup:cfd`。缺少产物明确失败，不生成占位包或读取本机 CFD runtime.json 进入发布包。CFD ZIP 包含原版 CfdOF、许可证和本项目适配器；FreeCAD、Docker/OpenFOAM、ParaView 由用户环境提供，模块包不声称安装这些外部产品。

每个平台输出到 `dist-modules/<系统>-<架构>/`，包括基础包、stencil/cfd/nozzle/injector/video/agent 六个功能包、ui-runtime/propulsion-runtime/ai-runtime 三个共用包，共十个 ZIP，以及签名 catalog。发布时上传同一平台全部 ZIP 和对应 catalog，安装器仅下载所选功能的依赖闭包。

Vite manifest 的静态/内部动态依赖、CSS 与资源决定所有权；基础程序和引导界面使用的资源放 base，仅被单一功能使用的资源放对应功能包，其余可选共享资源放 ui-runtime。WASM 与解析 Worker 归 stencil。源模块只从自己的公开入口接入分发入口，不重排业务目录。

macOS 构建复制 Fortran 非系统动态库、重写为同目录相对加载路径并执行 ad-hoc 签名。Linux/Windows 须通过 `LMBOX_PROPULSION_BUNDLE` 提供包含编译器运行库的可搬移 `solvers` 目录；脚本拒绝以开发库冒充完整分发包。Windows 仍需 WebView2，Linux 仍需受支持的 WebKit/GTK 系统环境。源码可构建不代表这些平台已打包验证。

## 发布配置

- `LMBOX_MODULE_SIGNING_KEY`：本地 Ed25519 PKCS#8 PEM 文件路径；私钥不复制到安装器、模块 ZIP 或版本控制。
- `LMBOX_MODULE_CATALOG`：安装器的完整签名 catalog 下载地址。
- `LMBOX_MODULE_RELEASE_TAG`：默认 `modules-v<应用版本>`；未显式配置下载地址时从本地 Git origin 的 GitHub 地址推导 Release 下载地址。
- `LMBOX_PACKAGE_PYTHON`：可覆盖 ZIP 适配使用的 Python；默认使用几何构建虚拟环境。
- `LMBOX_PROPULSION_BUNDLE`：外部准备的可搬移 solver 资源输入。

没有正式签名配置时只在忽略提交的 `.tools/modules` 创建本地开发密钥。该目录存放公钥和下载地址构建配置；正式发布需固定同一密钥，并重建包含对应公钥的安装器。公钥下载附件不能代替安装器内的信任锚。

脚本不创建、推送标签或上传 GitHub Release；远端发布遵循根规范的当次授权和既有质量门禁。`modules:package` 的本地产物不等于发布完成。

## 验证

执行 `npm run check`、安装管理 crate 的 fmt/Clippy/tests、Qt 打包与 QML 检查。验证签名 catalog 下真实按需安装、补装、重启后的模块状态与真实计算；发布前分别验证目标平台运行库搬移。新模块发布集不替代现有整包 CI/Release；远端发布流水线尚未自动上传模块 ZIP。
