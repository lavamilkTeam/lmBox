# Fortran 后端结构与依赖边界

先读 [根规范](../AGENTS.md)，代码变动应用 `$code-boundary-standards`。本目录按实际计算能力组织原生 Fortran 模块；只建立已经接入的求解器，不预建占位模块。

| 模块 | 必读说明 |
| --- | --- |
| `cea/` | [CEA 热化学内核](cea/agent-fortran-cea.md) |

Fortran 负责数值计算，Rust 负责工程、任务身份、输入校验和应用协调。调用方向为 `Rust runtime → 模块公开 C ABI → Fortran 内核`；模块不依赖前端、Tauri 或 Rust 应用内部实现。各计算模块保留其必要的原生构建结构，第三方来源及许可就近维护。

源码纳入 Git，构建缓存和二进制资源写入忽略目录 `.tools/`。当前通过 `npm run build:backend` 构建 Fortran 与 Rust 后端，验收按各模块说明及根规范执行。
