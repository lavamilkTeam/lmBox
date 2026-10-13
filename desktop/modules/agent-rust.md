# 模块分发与安装

先读[根规范](../../AGENTS.md)并应用 `$code-boundary-standards`。独立 Rust crate，不依赖 Tauri、Qt、业务核心或计算算法。Qt 通过 `lmbox-module-manager` 的 JSONL 命令接口调用；Tauri 通过 crate 公开入口读取启动时固定的安装快照。

## 边界与入口

- `catalog` 校验下载来源、Ed25519 签名、平台架构、版本、包身份和资源唯一归属。
- `archive` 只解压有界 ZIP，拒绝路径穿越、重复路径、特殊文件及逃逸链接，保留 Unix 执行权限和合法内部符号链接。
- `store` 解析依赖、持有跨进程安装锁、下载并验证 SHA-256、暂存不可变版本目录、原子替换安装登记；失败不启用新快照。已验证但尚未登记的目录可在重试时复用。
- `cfd` 只生成本机外部运行环境配置，不打包个人路径、不实现求解；缺少 FreeCAD 时模块安装与外部环境可用性分别处理。
- `model` 是模块分发 v1 数据映射。计算协议、工程数据及算法不进入本 crate。

## 分发格式

`catalog-<系统>-<架构>.json` 包含 Base64 编码的原始 JSON `payload` 和十六进制 Ed25519 `signature`。签名覆盖原始 payload 字节，公钥编译到安装管理程序，不能从同一下载源临时接受公钥。payload 的 `schemaVersion` 为 1，携带 `appVersion`、`target` 和 `packages`。

每个包携带 `id`、`version`、`kind`、ZIP 文件名、`sha256`、压缩/解压大小、依赖 ID 与 `uiFiles`。kind 为 base/module/runtime。同一发布集使用相同应用版本；依赖必须存在且无环。ZIP 内 `package.json` 身份必须与签名清单一致。UI 文件按唯一归属提供，只有安装快照登记的文件能被宿主读取。

## CLI 与本地状态

- `catalog [--catalog URL]`：返回已验证模块清单。
- `install [--catalog URL] [--root DIRECTORY] --modules nozzle,injector`：自动安装基础包和依赖，保留先前已安装的功能；同一发布集补装或整体换到新的发布集。
- `status [--root DIRECTORY]`：返回已安装快照。
- `remove --modules ID,... [--root DIRECTORY]`：取消模块登记，并去除没有使用者的依赖登记；旧版本文件保留供仍在运行的快照使用，不删除用户工程。
- `configure-cfd --python PATH [--root DIRECTORY]`：在本机配置 FreeCAD Python，Docker/ParaView 配置仅留在安装目录的私有运行文件。
- `launch [--root DIRECTORY]`：启动登记的基础程序，注入相同安装根目录。

安装根默认为系统用户数据目录下的 `lmBox`；显式 `LMBOX_INSTALL_ROOT` 或 CLI `--root` 可用于隔离验证。`packages` 保存不可变版本目录，`installed.json` 是原子切换的活动登记。宿主启动后固定快照，补装、更新、卸载在主程序重启后生效。尚未提供旧版本文件自动回收、断点续传或系统级安装注册。

网络发布使用 HTTPS并限制重定向；文件和回环 HTTP 仅用于本地验证，仍必须验证签名。下载/解压有文件数量、体积和路径限制；安装锁拒绝同时修改同一安装根。安装器取消会终止管理进程；未登记的临时目录不影响旧快照。

## 验证

执行 `cargo fmt --manifest-path desktop/modules/Cargo.toml --check`、`cargo clippy --manifest-path desktop/modules/Cargo.toml --locked --all-targets -- -D warnings`、`cargo test --manifest-path desktop/modules/Cargo.toml --locked`。公开入口测试覆盖 HTTP 按需下载、签名/哈希篡改、依赖循环、补装、卸载、旧快照保留、路径穿越与 Unix 权限/链接。三平台 CI 在桌面矩阵执行本 crate 检查；本地通过不代表远端矩阵已通过。
