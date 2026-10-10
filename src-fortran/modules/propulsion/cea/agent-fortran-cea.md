# Fortran：CEA 计算内核

先读 [Fortran 说明](../../../agent-fortran.md)，代码变动应用 `$code-boundary-standards`。本目录是正式纳入仓库的原生后端源码；上游版本、提交、归档摘要和本地构建调整记录在 `upstream.json`，许可证保留在 `LICENSE.txt` / `NOTICE.txt`。

| 范围 | 模块说明 |
| --- | --- |
| `source/`、`data/`、`extern/fbasics/` | [Fortran 内核与数据库](source/agent-fortran-core.md) |
| `source/bind/c/` | [C ABI 边界](source/bind/c/agent-fortran-c-api.md) |
| `CMakeLists.txt`、`cmake/` | [构建适配](../../../../scripts/agent-javascript-cea.md) |

依赖方向为 `Rust app → Rust runtime/cea → 官方 C ABI → Fortran 求解器 → 热力学数据/fbasics`；Fortran 不反向依赖 Rust、桌面宿主、前端或工程状态。保留上游模块结构，避免为了目录一致性拆散官方算法。

源码随仓库分发，可通过普通代码变更维护；构建不下载、不覆盖源码。只导入当前原生后端需要的 Fortran/C/CMake 与文本数据，不导入其他语言绑定和 README。核对上游变更时更新来源记录，算法变化需重新核验官方数值算例。

运行 `npm run build:backend` 从本目录编译 CEA 和 Rust 后端，再运行 `npm run check:cea`。跨端验证遵循根规范；Windows/Linux/macOS 由必需 CI 矩阵覆盖，本地通过不能替代远端结果。
