# Rust：喷管与喷注器应用入口

先读 [Rust 说明](../../../../agent-rust.md)。`app::PropulsionBackend::load(trusted_runtime_directory)` 装载项目自有 Fortran 模块；`design_nozzle(&CeaBackend, &NozzleRequest)` 协调同次 CEA 求解、喷管计算及可选燃烧室内轮廓计算，`design_injector(&InjectorRequest)` 直接调用 Fortran 水力模型。数值公式、物理输入校验和数值异常检测属于 [Fortran 模块](../../../../../src-fortran/modules/propulsion/design/agent-fortran-propulsion.md)，Rust 不重复实现。

调用方向为 `bin/propulsion → app → CeaBackend + runtime/propulsion → C ABI → Fortran`。协议由 [propulsion v1](../../../../../contracts/schemas/v1/agent-contracts-propulsion.md) 定义。Rust 只检查 schema/工程/任务身份、转换数据结构和 ABI 整数、调用内核、转换错误并封装结果。结果保持请求身份/修订号；喷管附带同次 CEA 结果，不接受外部伪造或过期的 CEA 解。同步调用，不保存工程状态；采纳结果前宿主须核对输入修订，尚无取消/超时功能。

CLI 接受单个不超过 64 KiB 的 JSON 请求；stdout 只输出成功 JSON，错误走 stderr 并非零退出。库路径是宿主参数，不是 JSON 字段。前端通过开发 CLI 或桌面 `propulsion_run` 调用；运行库装配由宿主负责。

```sh
npm run build:backend
cargo run --manifest-path src-rust/Cargo.toml --locked --bin propulsion -- .tools/propulsion/runtime .tools/cea/runtime < contracts/fixtures/v1/propulsion-nozzle-request.json
cargo run --manifest-path src-rust/Cargo.toml --locked --bin propulsion -- .tools/propulsion/runtime < contracts/fixtures/v1/propulsion-injector-request.json
npm run check:propulsion
```

喷注器调用不要求 CEA 库或数据库。两路 fixture 使用相同的示例水物性，仅用于数值验证，不是推进剂配方或物性数据库。验证通过公开入口；原生测试使用 `cea-integration` 功能和真实库，常规 Rust 检查另验证协议与非法模型类型。
