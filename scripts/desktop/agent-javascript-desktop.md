# JavaScript 工具：桌面构建适配

先读 [语言说明](../agent-javascript.md)；维护规则与隐私要求见根规范。

## 职责与边界

`build.mjs` 转发 Tauri CLI，`archive.mjs` 归档已构建的原生程序。公开命令为 `npm run desktop:dev`、`npm run desktop:build` 和 `npm run desktop:archive`；前端资源继续输出到 `dist/`，与云网页产物独立。

显式定位 desktop/tauri 与前端目录，保持 CLI 参数、资源映射、执行权限及符号链接；不复制核心业务或协议。

按需安装的功能与共用 runtime ZIP 继续使用[模块发布构建](agent-javascript-modules.md)的 `modules:package` / `modules:archive` 入口，模块构建通过 `desktop:build` 调用本目录的 Tauri 适配。

## 验证

按实际改动运行对应 npm 脚本；发布资源边界运行 `node --test scripts/desktop/release-assets.check.mjs`。跨语言/打包同时执行涉及端的模块检查。

开发启动将当前 Node 的路径传入 `LMBOX_AGENT_NODE`（显式配置优先），`predev:desktop` 构建 TypeScript Agent。开发启动可读取[AI 本地环境配置](../agent-javascript-ai.md)；发布归档同时保留 `geometry` 与 `ai` 资源目录及运行权限。
