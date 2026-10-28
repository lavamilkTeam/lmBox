# 模块 ZIP 发布构建

先读[构建工具说明](../agent-javascript.md)、[安装管理边界](../../desktop/modules/agent-rust.md)与[桌面打包](../../desktop/tauri/agent-rust-packaging.md)。`module-package.mjs` 只组装构建产物、划分资源归属并签名；`module-archive.py` 是保留权限和符号链接的 ZIP 文件适配，不包含安装业务或计算算法。

## 入口与产物

- `npm run modules:prepare`：准备签名配置并编译原生安装管理程序；Qt 构建自动调用。
- `npm run modules:package`：构建前端 manifest、启用桌面 `modular` 特性构建基础程序，再创建模块 ZIP 和签名目录。
- `npm run modules:archive`：对已经构建的模块版主程序与运行库创建 ZIP。
- `node scripts/desktop/module-package.mjs installer-archive`：将已部署的 Qt 下载安装器单独归档，并记录其校验值。
- `node scripts/desktop/module-package.mjs plan-ui MANIFEST DIST`：输出 Vite 资源归属及依赖规划，不构建或生成密钥。

`ai-runtime/ai/agent` 随共用 AI 包包含 ConeCode worker、当前目标的 Node 运行时及原许可证；不包含上游 Electron、依赖目录或凭据。

输入须先准备真实运行库：`build:worker`、`build:ai-worker`、`build:backend` 和 `setup:cfd`。CI 通过 `setup-cfd.mjs --source-only` 只获取固定源版本。缺少产物明确失败，不生成占位包或读取本机 CFD runtime.json 进入发布包。CFD ZIP 包含原版 CfdOF、许可证和本项目适配器；存在 `.tools/cfd/bundle/bundle.json` 时，默认验证并复制该平台的裁剪运行库到 `cfd/native`，`LMBOX_CFD_BUNDLE` 可覆盖输入位置，验证失败不回退宿主。构建与验证见[原生运行库](../cfd-runtime/agent-python-cfd-runtime.md)。没有该输入时仍生成依赖宿主环境的适配器包，不能宣称含原生求解环境。

每个平台输出到 `dist-modules/<系统>-<架构>/`，包括基础包、stencil/cfd/nozzle/video/agent 五个功能包、ui-runtime/propulsion-runtime/ai-runtime 三个共用包，共九个模块 ZIP。injector 暂不发布。原生下载安装器另为一个 ZIP，包含 Qt 与安装管理程序，不包含可选功能资源。发布时上传三平台完整 ZIP 集和对应签名 catalog，安装器仅下载所选功能的依赖闭包。

Vite manifest 的静态/内部动态依赖、CSS 与资源决定所有权；基础程序和引导界面使用的资源放 base，仅被单一功能使用的资源放对应功能包，其余可选共享资源放 ui-runtime。跨功能分发入口不会被基础依赖遍历；功能入口混入其他包时构建失败。WASM 与解析 Worker 归 stencil。源模块只从自己的公开入口接入分发入口，不重排业务目录。

三平台构建将 Fortran 非系统编译器运行库复制到各求解器同级并保留许可证。macOS 重写相对加载路径并执行 ad-hoc 签名；Linux 设置 `$ORIGIN` 并核对依赖确实解析到包内；Windows 收集导入表中的 GCC/线程 DLL。Linux/Windows 必须提供 `LMBOX_COMPILER_LICENSE_DIR`；已有资源可通过 `LMBOX_PROPULSION_BUNDLE` 输入。归档保留执行权限和内部符号链接，拒绝逃逸或失效链接。Windows 仍需 WebView2，Linux 仍需受支持的 WebKit/GTK 系统环境。

Windows PE 探测由同模块进程适配 `module-pe-imports.mjs` 逐行读取 `objdump -p`，仅返回导入 DLL 名称；大体积导出表不进入打包器的同步捕获缓冲。单行、导入名总量和错误尾部有界，工具启动失败、非零退出或异常输出仍终止打包。该适配不导出可供业务模块依赖的 JavaScript 接口。

## 发布配置

- `LMBOX_MODULE_SIGNING_KEY`：本地 Ed25519 PKCS#8 PEM 文件路径；私钥不复制到安装器、模块 ZIP 或版本控制。
- `LMBOX_MODULE_PUBLIC_KEY`：固定的十六进制 Ed25519 公钥；只配置公钥时构建不读取私钥，输出待签名 catalog payload。
- `LMBOX_MODULE_CATALOG`：安装器的完整签名 catalog 下载地址。
- `LMBOX_MODULE_RELEASE_TAG`：默认 `v<应用版本>`；发布工作流传入真实标签，未显式配置下载地址时从本地 Git origin 的 GitHub 地址推导 Release 下载地址。
- `LMBOX_PACKAGE_PYTHON`：可覆盖 ZIP 适配使用的 Python；默认使用几何构建虚拟环境。
- `LMBOX_PROPULSION_BUNDLE`：外部准备的可搬移 solver 资源输入。
- `LMBOX_COMPILER_LICENSE_DIR`：Linux/Windows 编译器运行库许可文本目录。
- `LMBOX_CFD_BUNDLE`：含 `bundle.json` 的已验证 CFD 运行库目录，平台必须匹配当前发布目标；只复制相对路径清单与二进制，不复制宿主配置。

没有签名配置时只在忽略提交的 `.tools/modules` 创建开发密钥，用于本地和分支 CI。正式发布必须固定同一公钥并编译到安装器；开发密钥不能发布。ZIP 和待签名 catalog 的 SHA-256、来源提交、公钥记录在平台构建清单中；发布阶段核对清单后才用私钥签名。公钥下载附件不能代替安装器内的信任锚。

脚本不创建、推送标签或上传 GitHub Release；远端发布遵循根规范的当次授权和既有质量门禁。`modules:package` 的本地产物不等于发布完成。

## 验证

执行 `npm run check`、安装管理 crate 的 fmt/Clippy/tests、Qt 打包与 QML 检查，以及 `node --test scripts/desktop/release-assets.check.mjs`。CI 桌面矩阵构建并解压真实模块 ZIP，将 geometry/AI worker 和 Fortran 测试指向搬移后的资源，并运行归档安装器的 `--smoke-test`；Windows 求解测试清除编译器 PATH。发布流程同时保留整包安装器和模块下载安装器，三平台完整发布集通过门禁后才上传；本地通过不代表远端构建或发布完成。
