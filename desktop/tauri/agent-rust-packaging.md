# 桌面 Rust：打包

先读 [语言说明](agent-rust.md)；维护规则与隐私要求见根规范。

## 职责与边界

范围：配置、权限、资源与安装器。

仅为核心提供桌面适配，单向依赖 src-rust 的公开接口；不复制业务参数验证或制造算法。

## 行为约束

- `tauri.conf.json`、`capabilities/`、`icons/` 和 `build.rs` 管理窗口、权限、资源与构建。生成资源位于忽略提交的 `resources/`，求解器源码及绑定不放在这里。

- 打包引擎只从应用资源目录或可执行程序相邻的固定 `geometry/` 目录定位，复用 `app::build_bundled_preview` 的参数校验、JSONL、60 秒超时及产物限制。PyInstaller 使用目录模式。

所有 npm 命令在仓库根目录运行。`scripts/desktop.mjs` 使用 Tauri CLI 的 `TAURI_APP_PATH` 与 `TAURI_FRONTEND_PATH` 显式定位宿主和前端；转发 CLI 参数，不依赖默认的目录发现规则。

1. 首次运行 `npm run setup:wasm` 与 `npm run setup:geometry`。
2. 运行 `npm run build:wasm`、`npm run build:worker`、`npm run check:worker`。
3. 开发运行 `npm run desktop:dev`，使用独立端口 1421；生产资源验证运行 `npm run desktop:build -- --no-bundle`。
4. 在根目录运行 `cargo fmt --manifest-path desktop/tauri/Cargo.toml --check`、`cargo clippy --manifest-path desktop/tauri/Cargo.toml --locked --all-targets -- -D warnings`、`cargo test --manifest-path desktop/tauri/Cargo.toml --locked`，并按根规范运行前端及核心检查。

`tests/packaged_worker.rs` 使用本目录的打包资源验证真实协议与取消；核心的任务生命周期和源码 Python 集成测试保留在 `src-rust/tests/`。`npm run check:worker` 把引擎移出源码目录验证模型与 STL。CI 的 Linux、Windows、macOS 矩阵必须全部成功，编译不代表三平台 GUI 操作已验证。

- 三平台 CI 生成 Windows x64 NSIS、macOS arm64 DMG、Linux x64 deb/AppImage，资源按既有映射打包，不新增计算协议。
- 版本标签发布复用完整 CI，打包上传由 `.github/workflows/` 与 `scripts/release-assets.mjs` 负责。前端、核心、宿主和 Tauri 配置的版本必须一致；来源提交、SHA-256 与质量门禁通过后才发布 Release。
- macOS 仅使用 ad-hoc 签名，不等同 Apple 开发者签名或公证；Windows 发布者签名、Intel macOS 和软件内自动更新不在当前范围。
- 发布方式及限制见 [质量规范](../../.github/QUALITY.md#versioned-releases)。推送仍须当次明确授权。

## 验证

全部矩阵与质量门禁须成功；本地检查不代表实际发布完成。
