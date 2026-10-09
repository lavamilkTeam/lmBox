# JavaScript 工具：CEA 构建适配

先读 [工具说明](agent-javascript.md) 和 [原生接口](../src-rust/src/runtime/cea/agent-rust-cea.md)。`build-cea.mjs` 是独立构建入口，不实现热化学算法。

`npm run build:cea` 下载固定 NASA CEA 3.3.4 提交，验证归档 SHA-256，再以 CMake/Ninja 编译官方 Fortran 内核和 C ABI。只提取所需构建输入，排除 README；不修改上游源代码。源码、构建缓存与运行资源均在忽略目录 `.tools/cea/`，不提交二进制。

要求 Node 24、CMake ≥3.19、Ninja、tar、C 编译器及 GNU Fortran ≥13。编译器可通过 `CC`/`FC` 指定，工具可通过 `CMAKE`/`NINJA` 指定。Linux 使用系统 GCC/gfortran；macOS 可用 Homebrew GCC；Windows 使用 MSYS2 UCRT64 GCC/Fortran，构建和运行时保持其 bin 在 PATH。Rust 可用原生 MSVC 工具链，通过动态 C ABI 调用 GNU Fortran DLL。

输出 `.tools/cea/runtime/` 包含平台原生库、thermo/trans 数据库、上游 LICENSE/NOTICE 与来源 manifest。当前 API 只加载热力学数据库。GNU Fortran 运行库仍由本机工具链提供；这里不生成独立安装包或修改 Tauri 资源。发布打包时需单独处理原生依赖和相应许可。

测试使用 `npm run check:cea`；可用 `LMBOX_CEA_RUNTIME` 指定测试资源目录。三平台 CI 编译库并运行真实接口测试，不能以 mock 或跳过缺失库替代。
