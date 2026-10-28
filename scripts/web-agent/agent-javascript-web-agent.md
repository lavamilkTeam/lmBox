# Agent 网页发布

先读 [构建工具说明](../agent-javascript.md)。这是独立于桌面、模块包和完整云网页的发布入口，不修改它们的功能集合。

- `npm run web:agent:build` 构建 `dist-web-agent/`；`web:agent:package` 另外生成带系统、架构的归档。入口 `agent-web.html → frontend/web-agent.ts → app/WebAgent.vue` 只组装 Agent 和共享主题，工程模块不进入依赖图。
- 发布包包含静态页面、Node HTTP 宿主、既有 Rust `ai` CLI、编译后的 Agent、配置模板和许可证。构建机器需要 Rust、前端依赖；部署要求相同系统/架构和 Node 24+。Linux 部署包须在 Linux 构建，不可把 macOS 归档部署到 Linux。
- `server.mjs` 是 HTTP 公开入口；`lib/transport.mjs` 私有适配 JSONL，业务与工具仍归 Rust，模型调用归 Agent。只接受 agent 能力，不携带或启用视频、求解器及桌面宿主。
- 首版一个实例对应一个受信操作员，配置 HTTP Basic 用户及至少 16 字符密码，经 HTTPS 反代访问；必须设置准确公开 Origin，反代保留 Host。此配置不是多租户账户系统。原有任务历史仍在内存，重启不恢复；持久数据目录保留防重放标记。
- 模型 URL 指向独立网站管理的 `/api/model-gateway/v1`，模型 ID 为后台配置 ID；服务调用凭据与上游密钥分离。配置仅放服务端环境，模板不含实际凭据。两个仓库只通过 HTTP 协议对接。
- 在解压目录使用 `node --env-file=/private/config/runtime.env server/server.mjs` 启动，模板见 `runtime.env.example`。默认监听回环地址；反向代理的响应超时须大于模型总超时，SSE 不应缓冲。

验证：`npm run check` 包含独立宿主 HTTP 授权/来源/能力检查；`npm run web:agent:package` 验证专用入口构建和原生包。`tests/*.check.mjs` 使用 Node 测试运行器，经 server 公开入口测试，不混入 Vitest 匹配规则。禁止把替身测试宣称为真实上游联调。
