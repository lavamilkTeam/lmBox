# Agent 网页发布

先读 [构建工具说明](../agent-javascript.md)。这是独立于桌面、模块包和完整云网页的发布入口，不修改它们的功能集合。

- `npm run web:agent:build` 构建 `dist-web-agent/`；`web:agent:package` 另外生成带系统、架构的归档。入口 `agent-web.html → frontend/web-agent.ts → app/WebAgent.vue` 只组装 Agent 和共享主题，工程模块不进入依赖图。
- 发布包包含静态页面、Node 公开 HTTP 宿主和容器运行时、既有 Rust `ai` CLI、编译后的 Agent、配置模板和许可证。构建机器需要 Rust、前端依赖；部署要求相同系统/架构和 Node 24+。Linux 部署包及 Docker 镜像须在 Linux 构建，不可把 macOS 归档部署到 Linux。
- `server.mjs` 是公开 HTTP 入口；`runtime.mjs` 是仅监听受控内部网络的容器入口。`lib/transport.mjs` 私有适配本地 Rust JSONL，`lib/cloud-transport.mjs` 私有适配管理器确保接口及远程运行时。业务与工具仍归 Rust，模型调用归 Agent，只接受 agent 能力。
- 首版一个公开实例对应一个受信操作员，配置 HTTP Basic 用户及至少 16 字符密码，经 HTTPS 反代访问；必须设置准确公开 Origin，反代保留 Host。此配置不是多租户账户系统。原有任务历史仍在内存，重启不恢复；持久数据目录保留防重放标记。
- 本地模式直接使用同源宿主中的 Rust CLI。云端模式必须同时配置 `LMBOX_CONTAINER_ENSURE_URL`、`LMBOX_CONTAINER_SERVICE_TOKEN`、`LMBOX_CLOUD_USER_ID`；新对话和切换对话的 `inspect` 先确保该用户的容器，后续请求只转发到容器，失败时不得回退宿主机执行。当前用户 UUID 由服务端配置，不能接受浏览器指定身份。
- 本地模型 URL 指向网站管理的 `/api/model-gateway/v1`。云端容器使用管理器的 `/api/containers/v1/model-gateway/v1` 受限代理和每用户运行时凭据，不持有应用级网关 token；代理只开放分配的模型。配置仅放服务端环境，两个仓库只通过 HTTP 协议对接。
- 在解压目录使用 `node --env-file=/private/config/runtime.env server/server.mjs` 启动公开宿主，模板见 `runtime.env.example`。默认监听回环地址；反向代理的响应超时须大于模型总超时，SSE 不应缓冲。`Dockerfile` 以 `dist-web-agent/` 为构建上下文生成非 root 运行时镜像，数据卷挂载 `/data`，容器不安装也不挂载 Docker Socket。

验证：`npm run check` 包含独立宿主 HTTP 授权/来源/能力检查；`check:web-agent` 另验证新对话确保、远程转发和失败关闭。`npm run web:agent:package` 验证专用入口构建和原生包，`check:web-agent:package` 验证真实本地 Rust/Node/模型替身执行链。`tests/*.check.mjs` 经 server/runtime 公开入口测试，不混入 Vitest 匹配规则。禁止把替身测试或 macOS 构建宣称为真实 Linux Docker 和云端模型联调。
