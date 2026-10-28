# 构建工具结构与边界

先读 [根规范](../AGENTS.md) 和实际涉及的语言说明，应用 `$code-boundary-standards`。本目录使用 Node 的 JavaScript/TypeScript 脚本作为外部构建与开发适配，不放前端业务、Rust 格式解析或 Python 制造算法。按真实用途独立封装，避免总工具容器。

| 脚本范围 | 必读说明 |
| --- | --- |
| `desktop/module-package.mjs`、`desktop/module-pe-imports.mjs`、`module-archive.py` | [模块 ZIP 发布构建](desktop/agent-javascript-modules.md) |
| `desktop/installer.mjs`、根 `vite.installer.config.ts` | [安装页面构建](desktop/agent-javascript-installer.md) |
| `setup-cfd.mjs`、`prepare-openfoam-source.py/prepare-openfoam-source.check.py` | [CFD 环境准备](agent-javascript-cfd.md) |
| `bundle-cfd-runtime.py`、`check-cfd-runtime.py`、`cfd-runtime/` | [CFD 原生构建与裁剪](cfd-runtime/agent-python-cfd-runtime.md) |
| `build-propulsion.mjs` | [推进设计构建](agent-javascript-propulsion.md) |
| `build-cea.mjs` | [CEA 构建](agent-javascript-cea.md) |
| `build-wasm/build-worker/check-worker/geometry-env` | [构建与引擎环境](agent-javascript-build.md) |
| `ai-api.ts`、`ai-env.mjs`、`build-ai-worker.mjs`、`build-agent.mjs`、`check-agent-worker.mjs` | [AI 传输与环境](agent-javascript-ai.md) |
| `cfd-api.ts` | [CFD 开发传输](agent-javascript-cfd-api.md) |
| `propulsion-api.ts` | [推进计算开发适配](agent-javascript-propulsion-api.md) |
| `preview-api.ts` | [开发计算适配](agent-javascript-preview-api.md) |
| `desktop/build.mjs`、`desktop/archive.mjs` | [桌面程序构建与归档](desktop/agent-javascript-desktop.md) |
| `web-agent/build.mjs`、`web-agent/server.mjs` | [Agent 网页发布](web-agent/agent-javascript-web-agent.md) |
| `cloud/build.mjs` | [云网页构建与打包](cloud/agent-javascript-cloud.md) |
| `desktop/release-assets.mjs`、`desktop/release-assets.check.mjs` | [桌面发布产物校验](desktop/agent-javascript-release-assets.md) |

只修改实际受影响脚本模块说明；调用链和外部接口变化还需同步涉及语言的适配说明。
