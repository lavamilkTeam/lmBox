# Fortran：推进业务模块

先读 [Fortran 说明](../../agent-fortran.md)。按业务域聚合现有计算库，内部遵循数值库惯例，不为目录对称额外套 `features`。

| 计算能力 | 模块说明 |
| --- | --- |
| `cea/` | [NASA CEA 热化学与理想火箭](cea/agent-fortran-cea.md) |
| `design/` | [喷管型面与喷注器水力初算](design/agent-fortran-propulsion.md) |

两库各自保留 C ABI、CMake 和运行资源，不直接访问另一库的内部模块；Rust 应用层取得 CEA 结果，再传给设计计算库。CEA 保留上游来源和许可证，design 为项目自有实现。构建入口为 `npm run build:backend`，数值验证为 `npm run check:cea` 与 `npm run check:propulsion`。实际发布打包由宿主负责，不把运行缓存作为源码。
