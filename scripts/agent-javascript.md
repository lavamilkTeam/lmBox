# 构建工具结构与边界

先读 [根规范](../AGENTS.md) 和实际涉及的语言说明，应用 `$code-boundary-standards`。本目录使用 Node 的 JavaScript/TypeScript 脚本作为外部构建与开发适配，不放前端业务、Rust 格式解析或 Python 制造算法。按真实用途独立封装，避免总工具容器。

| 脚本范围 | 必读说明 |
| --- | --- |
| `build-wasm/build-worker/check-worker/geometry-env` | [构建与引擎环境](agent-javascript-build.md) |
| `preview-api.ts` | [开发计算适配](agent-javascript-preview-api.md) |
| `desktop.mjs/archive-desktop.mjs` | [桌面构建适配](agent-javascript-desktop.md) |
| `release-assets.mjs/release-assets.check.mjs` | [发布产物校验](agent-javascript-release-assets.md) |

只修改实际受影响脚本模块说明；调用链和外部接口变化还需同步涉及语言的适配说明。
