# AI 开发传输与运行环境

先读[构建工具说明](agent-javascript.md)和[AI 协议](../contracts/schemas/v1/agent-contracts-ai.md)。`ai-api.ts` 只将同源、有界请求转发给 Rust `ai` CLI；任务状态、版本和 Node/Python 子进程归 Rust。请求断开不取消任务，开发服务关闭时结束 CLI 输入并回收进程。

`npm run build:agent` 编译独立 [ConeCode Agent](../agent/agent-typescript.md) 到 `agent/dist`；开发 HTTP 和桌面宿主经 Rust 启动 Node worker，不要求 Agent 安装 Python。视频仍使用 Python。`dev`、`build`、`check` 自动构建 Agent；单独运行浏览器验收前先构建它。

`npm run setup:ai` 用 Python 3.10–3.13 创建独立 `.tools/ai/venv` 并安装 `engine[ai,dev,bundle]`，不改变几何环境。可用 `LMBOX_AI_BUILD_PYTHON` 指定构建解释器；`LMBOX_AI_PYTHON` 指定运行解释器。`build:ai` 构建 CLI，`check:ai` 验证 Python AI 用例，`build:ai-worker` 构建独立可搬移 PyInstaller 目录，`check:ai-worker` 搬移后使用本地模型服务替身验证真实 LangGraph、计算工具和文件产物。

开发传输和桌面启动脚本读取可选、已忽略的 `.tools/ai/runtime.env`；可从 [环境模板](ai-runtime.env.example) 复制。只在该本地文件或进程环境配置实际值，不提交凭据：

| 变量 | 用途 |
| --- | --- |
| `LMBOX_COMFYUI_URL` | 本机 ComfyUI 服务，默认 `http://127.0.0.1:8188` |
| `LMBOX_COMFYUI_API_KEY` | 可选服务访问认证 |
| `LMBOX_COMFY_PARTNER_API_KEY` | 云端 Partner 节点认证，由后端注入 |
| `LMBOX_COMFY_NODE_CREDENTIALS` | 自定义节点凭据 JSON，按节点类型及凭据输入名映射 |
| `LMBOX_AGENT_BASE_URL` | 兼容 Chat Completions 的模型 API 基址 |
| `LMBOX_AGENT_MODEL` | 模型标识 |
| `LMBOX_AGENT_API_KEY` | 可选模型访问凭据 |
| `LMBOX_AGENT_TIMEOUT_MS` | 模型请求总超时，默认 200000 毫秒 |
| `LMBOX_AGENT_REASONING_EFFORT` | 可选推理强度 |

ComfyUI 在本机编排，模型可以由云端 API 提供；环境准备不安装 ComfyUI、GPU 驱动或模型权重。实际节点来自 ComfyUI 元数据，缺少服务/节点/模型配置明确失败。

验证运行前端及 Rust 检查、`check:ai` 和使用可辨识服务替身的浏览器链路。真实云端推理需要用户配置服务及凭据；不能以替身结果宣称验证云端模型。

`build-agent.mjs bundle` 将当前平台 Node 24+、编译后的 worker 和许可证复制到 `resources/lmbox-ai/agent`；只接受带 LICENSE 的 Node 发行目录，可用 `LMBOX_AGENT_NODE_DIST` 指定。该目录必须与目标系统和架构一致，不支持复制宿主动态依赖来交叉打包。`build:ai-worker` 在 Python bundle 后自动组装此目录。`check:ai-worker` 保留旧 Python 校验，并调用 `check-agent-worker.mjs` 搬移 Node 资源，通过真实 Rust CLI、明确的本地模型夹具验证工具循环与产物下载；此检查不代表真实云端模型或其他平台已验证。
