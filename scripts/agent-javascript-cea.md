# JavaScript 工具：CEA 构建适配

先读 [工具说明](agent-javascript.md) 和 [原生接口](../src-rust/src/runtime/cea/agent-rust-cea.md)。`build-cea.mjs` 是独立构建入口，不实现热化学算法。

`npm run build:cea` 从仓库 [src-fortran/cea/](../src-fortran/cea/agent-fortran-cea.md) 直接编译 Fortran 内核和官方 C ABI，不联网下载或覆盖源码。`npm run build:backend` 顺序编译 CEA 和 Rust 后端入口。来源由 `src-fortran/cea/upstream.json` 记录；构建对实际源码树计算摘要并写入运行库 manifest，允许通过正常代码变更维护本地源码。构建缓存位于 `.tools/cea/fortran-build/`，不提交二进制。

要求 Node 24、CMake ≥3.19、Ninja、C 编译器及 GNU Fortran ≥13。编译器可通过 `CC`/`FC` 指定，工具可通过 `CMAKE`/`NINJA` 指定。Linux 使用系统 GCC/gfortran；macOS 可用 Homebrew GCC；Windows 使用 MSYS2 UCRT64 GCC/Fortran，构建和运行时保持其 bin 在 PATH。Rust 可用原生 MSVC 工具链，通过动态 C ABI 调用 GNU Fortran DLL。

输出 `.tools/cea/runtime/` 包含平台原生库、thermo/trans 数据库、上游 LICENSE/NOTICE 与来源 manifest。当前 API 只加载热力学数据库。GNU Fortran 运行库仍由本机工具链提供；这里不生成独立安装包或修改 Tauri 资源。发布打包时需单独处理原生依赖和相应许可。

测试使用 `npm run check:cea`；可用 `LMBOX_CEA_RUNTIME` 指定测试资源目录。三平台 CI 编译库并运行真实接口测试，不能以 mock 或跳过缺失库替代。
