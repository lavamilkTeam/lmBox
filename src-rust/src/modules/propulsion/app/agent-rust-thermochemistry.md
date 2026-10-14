# Rust：CEA 后端入口

先读 [Rust 说明](../../../../agent-rust.md)。原生公开入口为 `app::CeaBackend::load(runtime_dir)` 和 `solve(&CeaRequest)`；错误为 `CeaError`。宿主提供可信运行库目录，请求不携带文件路径。

调用方向为 `bin/cea → app → features/thermochemistry + runtime/cea → 官方 C ABI → Fortran`。数据类型从 `contracts::thermochemistry` 引入，语义见 [协议](../../../../../contracts/schemas/v1/agent-contracts-cea.md)。计算算法来自 NASA CEA 3.3.4，不在 Rust、C 或 Python 重写。

当前支持 TP、入口混合焓驱动的绝热 HP，以及无限面积燃烧室的理想火箭性能；火箭支持平衡流、燃烧室冻结和喉部冻结。结果包括热力学量、组分及各站性能。输运参数、电离物种、自定义物种、有限面积燃烧室和喷管轮廓设计未接入。

`solve` 是同步调用；原生调用在进程内串行执行，宿主应放在计算线程。没有任务队列、取消或超时接口。返回值保留请求身份及修订号，不写工程状态；未来调用者必须核对当前修订后再采纳结果。原生错误或未收敛返回 `Err`，不发布部分解。

`src/bin/cea.rs` 是单请求 JSON stdin/stdout 薄适配，限制请求为 64 KiB，诊断走 stderr，失败退出码非零。示例（仓库根目录）：

```sh
npm run build:backend
cargo run --manifest-path src-rust/Cargo.toml --locked --bin cea -- .tools/cea/runtime < contracts/fixtures/v1/cea-rocket-request.json
```

构建要求见 [CEA 构建适配](../../../../../scripts/agent-javascript-cea.md)。仅接入后端 Rust/CLI，尚未接桌面 IPC 或前端。运行 `npm run check:cea` 验证真实库、NASA RP-1311 example 8、TP/HP 一致性、冻结组分、非收敛、错误恢复、并发身份及搬移后 CLI。默认 Rust 测试验证协议；`cea-integration` 功能测试必须先构建库，缺库会失败而非跳过。
