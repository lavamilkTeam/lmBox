# TypeScript Agent 执行服务

`index.ts` 是无界面执行核心的公开入口，`worker.ts` 是单任务 JSONL 进程入口。`lib/` 为私有实现，调用方和测试仅通过公开入口或进程协议访问。依赖方向为 `Rust 宿主 → worker → application → provider / 注入的宿主工具`；浏览器不得导入此服务，执行核心不依赖 Electron、React、Vue 或 Zustand。

本模块从 ConeCode 提取兼容模型的消息转换、流式工具调用累积及有界 Agent 循环。来源和改动范围见 [NOTICE](third-party/conecode/NOTICE)，原始 MIT 许可见 [LICENSE](third-party/conecode/LICENSE)。lmBox 的主许可证保持不变。当前仅接入普通工作 Agent；不将未接入的 RSI、MCP、多 Agent 和桌面控制声明为已实现。

详细接口及限制见 [执行模块](agent-typescript-runtime.md)。根目录依赖提供 TypeScript 和 Node 类型；`tsc -p agent/tsconfig.json` 产生独立 ESM `dist/worker.js`，部署时携带 `package.json`、`dist/` 及第三方许可。运行要求 Node.js 22 或更新版本，执行期间不依赖前端开发服务器。

验证：根目录 `npm run check`，以及 `tsc -p agent/tsconfig.json`。`tests/` 经公开入口验证工具结果往返、历史隔离、权限目录、取消和提供方错误；进程测试验证宿主 JSONL 与 EOF 生命周期。
