# JavaScript：Fortran 设计模块构建

先读 [工具说明](agent-javascript.md)。`build-propulsion.mjs` 只负责工具调用、资源复制和源码摘要，不实现数值算法。源码为 [src-fortran/modules/propulsion/design](../src-fortran/modules/propulsion/design/agent-fortran-propulsion.md)，CMake/Ninja 缓存为 `.tools/propulsion/modules-build/`，运行库与来源 manifest 为 `.tools/propulsion/runtime/`。

`npm run build:propulsion` 从本地源码编译共享库并执行 C ABI 测试，不下载源码。`npm run build:backend` 按 CEA、propulsion、Rust 顺序构建。工具链与 CEA 构建相同：Node、CMake、Ninja、C 编译器和 GNU Fortran，支持 `CMAKE`、`NINJA`、`CC`、`FC`；Windows 使用 MSYS2 UCRT64，运行时其 bin 须在 PATH，Rust 可使用 MSVC。失败立即非零退出；库仍由主机提供 Fortran 运行时，桌面分发未接入。

`npm run check:propulsion` 验证真实 Fortran 调用；测试路径可由 `LMBOX_PROPULSION_RUNTIME`、`LMBOX_CEA_RUNTIME` 指定。CI 在原有 Fortran CEA 三平台矩阵中追加该测试，不改变质量门禁名称或允许跳过。
