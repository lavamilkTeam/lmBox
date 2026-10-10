# Rust：Fortran 设计计算适配

先读 [Rust 说明](../../../../../agent-rust.md)。只向应用层提供 crate 内 `Engine`，通过 [C 头文件](../../../../../../src-fortran/modules/propulsion/design/include/propulsion.h) 所声明的 ABI 1 装载动态库；FFI 布局和符号私有。宿主目录先规范化，库对象拥有函数指针生命周期。

本适配只转换请求字段、C 整数范围、结果结构和错误；没有喷管/喷孔公式。数值输入由 Fortran 校验。调用使用固定 4097 点最大缓冲区及 256 字节错误缓冲区；失败不读取数值结果，成功后检查返回点数。Fortran 接口重入且无全局状态，不需要 CEA 的全局锁；CEA 自己的状态保护保持独立。

构建及工具链见 [构建适配](../../../../../../scripts/agent-javascript-propulsion.md)。验证由 [公开应用入口](../../app/agent-rust-propulsion.md) 的真实原生测试和 Fortran C ABI 测试覆盖。开发库仍依赖主机 Fortran 运行时，未作为独立桌面资源打包。
