# Rust：Fortran CEA 原生适配

先读 [Rust 说明](../../../../../agent-rust.md)。仅向应用层公开 crate 内 `initialize` / `solve`；`ffi.rs` 与原生句柄私有。外部契约见 [CEA v1](../../../../../../contracts/schemas/v1/agent-contracts-cea.md)。

通过 `libloading` 加载宿主可信目录中的 CEA 3.3.4 官方 C ABI 库，并验证版本。初始化使用绝对 `thermo.lib` 路径，不修改工作目录或进程环境。单进程只接受一个规范化运行库目录。进程级互斥锁覆盖初始化、求解、错误信息提取和 RAII 析构；库保留到进程结束，句柄不跨边界。

FFI 声明与仓库内 [src-fortran/modules/propulsion/cea/source/bind/c/cea.h](../../../../../../src-fortran/modules/propulsion/cea/source/bind/c/cea.h) 一致，只调用带错误恢复的公开 C 符号，禁止直接调用 `*_fortran`。物种名使用调用方缓冲区，Fortran 分配对象使用匹配的析构函数。请求长度先经 feature 验证，产品/站点数组长度由原生 API 返回并核对。

单位换算集中在本适配：输入 Pa 转 bar；混合物焓 J/kg 除以 CEA 的 R=8314.51 转 h/R；解中的 kJ/kg、kJ/(kg·K) 转 SI；原生 Isp/Ivac 是 m/s，除以 g0=9.80665 后返回秒。无限面积燃烧室的性能字段为 null，不能以零代表有效性能。非收敛、非有限/未定义结果或非法组分均失败。

GNU Fortran 运行时来自构建机的编译器安装；当前目录是开发后端资源，尚不是可独立分发的桌面资源。验证通过应用公开入口执行，见 [应用模块](../../app/agent-rust-thermochemistry.md)。
