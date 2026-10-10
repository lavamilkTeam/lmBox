# Fortran：官方 C ABI 边界

先读 [CEA 模块说明](../../../agent-fortran-cea.md)。`cea.h` / `cea_enum.h` 定义 C ABI，`bindc.F90` 使用 `iso_c_binding` 连接 Fortran 内核；`cea_recovery.c` / `cea_abort_support.c` 提供官方错误恢复。C 层不复制计算算法。

Rust 只使用 [原生适配](../../../../../src-rust/src/runtime/cea/agent-rust-cea.md) 封装后的能力，不把原生句柄公开给应用层。更新头文件、枚举、Fortran 导出或错误恢复时，必须同步核对 Rust FFI 声明、缓冲区长度、资源所有权、单位及并发约束。

通过 `npm run build:backend` 与 `npm run check:cea` 验证跨语言调用、官方数值算例、非收敛、错误恢复、资源生命周期和并发身份。Python、MATLAB、Excel 和 C++ 绑定不属于本次后端接口。
