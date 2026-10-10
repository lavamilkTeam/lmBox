# Fortran：热化学求解器与数据

先读 [CEA 模块说明](../agent-fortran-cea.md)。官方 `cea.f90` 汇集求解器公开 Fortran 类型；`equilibrium.f90` 负责化学平衡，`rocket.f90` 负责理想火箭，`mixture.f90`、`thermo.f90` 等负责物种、混合物与热力学运算。数值算法留在本层，工程/任务身份和请求合法性由 Rust 负责。

`../data/thermo.inp` / `trans.inp` 是源文本数据库；`database_compile.f90` 编译成本机二进制数据文件。数据库产物只写构建目录，禁止在源码树生成 `.lib`。`../extern/fbasics/` 为上游随附的底层 Fortran 依赖，不依赖 lmBox 应用模块。

官方源码内含其他求解器，以满足原生核心及 C ABI 的编译依赖；lmBox 已公开的功能范围以 [应用入口](../../../src-rust/src/app/agent-rust-thermochemistry.md) 为准。上游可选测试文件不等同于已执行验证；当前必需验收是 `npm run check:cea` 的真实后端回归。
