# 模块分发与安装

先读[根规范](../../AGENTS.md)并应用 `$code-boundary-standards`。独立 Rust crate，不依赖 Tauri、Qt、业务核心或计算算法。Qt 通过 `lmbox-module-manager` 的 JSONL 命令接口调用；Tauri 通过 crate 公开入口读取启动时固定的安装快照。

## 边界与入口

- `catalog` 校验下载来源、Ed25519 签名、平台架构、版本、包身份和资源唯一归属。
- `archive` 只解压有界 ZIP，拒绝路径穿越、重复路径、特殊文件及逃逸链接，保留 Unix 执行权限和合法内部符号链接。
- `store` 解析依赖、持有跨进程安装锁、下载并验证 SHA-256、暂存不可变版本目录、原子替换安装登记；失败不启用新快照。已验证但尚未登记的目录可在重试时复用。
- `cfd` 根据已安装包的 `native/bundle.json` 将固定相对入口解析为本机运行配置，校验平台、必需文件与链接边界，不实现求解；原生包缺失或损坏明确失败。旧的适配器包仍支持宿主 FreeCAD 配置。
- `model` 是模块分发 v1 数据映射。计算协议、工程数据及算法不进入本 crate。

## 分发格式

`catalog-<系统>-<架构>.json` 包含 Base64 编码的原始 JSON `payload` 和十六进制 Ed25519 `signature`。签名覆盖原始 payload 字节，公钥编译到安装管理程序，不能从同一下载源临时接受公钥。payload 的 `schemaVersion` 为 1，携带 `appVersion`、`target` 和 `packages`。

每个包携带 `id`、`version`、`kind`、ZIP 文件名、`sha256`、压缩/解压大小、依赖 ID 与 `uiFiles`。kind 为 base/module/runtime，唯一基础包 ID 为 `base`。同一发布集使用相同应用版本，ZIP 文件名忽略大小写后不得重复；全部依赖必须存在且无环。依赖只能指向 base/runtime，共用文件归运行库包，不能通过依赖带入未勾选的 module。ZIP 内 `package.json` 身份必须与签名清单一致。UI 文件按唯一归属提供，只有安装快照登记的文件能被宿主读取。

## CLI 与本地状态

- `catalog [--catalog URL]`：返回已验证模块清单。
- `install [--catalog URL] [--root DIRECTORY] --modules nozzle,cfd`：只下载所选功能、基础包及共用运行库依赖；已验证的同版本包直接复用。空选择只安装基础程序，同一发布集补装时保留先前已安装的功能；不接受 base/runtime 或未发布的功能 ID。
- `status [--root DIRECTORY]`：返回已安装快照。
- `remove --modules ID,... [--root DIRECTORY]`：取消模块登记，并去除没有使用者的依赖登记；旧版本文件保留供仍在运行的快照使用，不删除用户工程。
- `configure-cfd --python PATH [--root DIRECTORY]`：在本机配置 FreeCAD Python，Docker/ParaView 配置仅留在安装目录的私有运行文件。
- `launch [--root DIRECTORY]`：启动登记的基础程序，注入相同安装根目录。

安装根默认为系统用户数据目录下的 `lmBox`；显式 `LMBOX_INSTALL_ROOT` 或 CLI `--root` 可用于隔离验证。`packages` 保存不可变版本目录，`installed.json` 是原子切换的活动登记。宿主启动后固定快照，补装、更新、卸载在主程序重启后生效。尚未提供旧版本文件自动回收、断点续传或系统级安装注册。

包含原生 CFD 运行库时，包内 `package.json` 标记 `bundledCfdRuntime`；配置优先使用包内 FreeCAD、VTK Python 和 OpenFOAM，不继承旧 Docker/ParaView GUI 设置；显式 `--python` 只覆盖解释器。macOS 配置通过系统 `sw_vers` 检查清单 `minimumMacOS`，拒绝低于最低版本的宿主及缺失、无效的版本要求。原生运行库校验失败时清除旧运行配置，不回退宿主。移动安装目录后重新配置以解析新路径；发布包本身不包含宿主绝对路径。运行库来源、依赖与搬移检查归[构建模块](../../scripts/cfd-runtime/agent-python-cfd-runtime.md)。

切换发布版本时更新仍在发布的已安装功能；新发布集下架的功能移出活动登记，其不可变目录仍供旧进程使用。同版本清单缺少已安装功能时拒绝补装，避免不完整的发布集静默撤销功能。上述行为不下载新发布集里从未选择的功能包。

网络发布使用 HTTPS并限制重定向；文件和回环 HTTP 仅用于本地验证，仍必须验证签名。下载/解压有文件数量、体积和路径限制；安装锁拒绝同时修改同一安装根。安装器取消会终止管理进程；未登记的临时目录不影响旧快照。

## 验证

执行 `cargo fmt --manifest-path desktop/modules/Cargo.toml --check`、`cargo clippy --manifest-path desktop/modules/Cargo.toml --locked --all-targets -- -D warnings`、`cargo test --manifest-path desktop/modules/Cargo.toml --locked`。公开入口测试记录真实 HTTP 请求，验证空选择、指定功能及依赖、补装、重复安装、未发布功能与版本下架；同时覆盖签名/哈希篡改、可选模块依赖拒绝、全图依赖循环、卸载、旧快照保留、路径穿越与 Unix 权限/链接。三平台 CI 在桌面矩阵执行本 crate 检查；本地通过不代表远端矩阵已通过。
