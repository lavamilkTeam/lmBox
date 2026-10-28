# Agent 执行与宿主协议

`executeAgent(request, dependencies, context?)` 接收 AI v1 inspect/start 请求。依赖显式注入提供方、工具执行器、进度回调和 AbortSignal；它不读写工程文件，不持有数据库或桌面状态。`createOpenAIProvider` 从可信宿主环境读取 `LMBOX_AGENT_BASE_URL`、`LMBOX_AGENT_MODEL`、`LMBOX_AGENT_API_KEY`，默认兼容模型 URL；inspect 只调用 models，start 使用 Chat Completions。密钥和提供方原始错误不得返回用户。

每个 worker 只接收一个 `{request, workspace, context}` 信封。stdout 仅输出 progress/result/error 和 `{type: 'tool', id, name, arguments}`；Rust 以 `{type: 'tool_result', id, data}` 回答，data 为 `{ok: true, result}` 或 `{ok: false, error: {code, message}}`。取消帧为 `{type: 'cancel'}`，stdin EOF 同样取消；待决工具被拒绝，模型 HTTP 请求被中止。workspace 必须是宿主绝对路径，但 TypeScript 不访问它；附件暂存、工具能力和最终产物登记由 Rust 完成。start 返回 `{text, artifacts: []}`，Rust 合并其真实产物。

工具固定为 calculate、list_files、read_file、write_file、workspace_info。未列入目录的工具和不匹配的参数不会转交宿主。每轮最多八次工具调用、模型步数 1–32，工具串行执行以保留写后读顺序。输入历史最多 20 组完整 user/assistant 文本、合计 128 KiB，不接受 system/tool、额外字段或不完整对话；旧附件不自动复制。

HTTP 请求和响应、模型上下文最多 2 MiB，HTTP 总时限默认 200 秒（LMBOX_AGENT_TIMEOUT_MS 可设为 1000–600000 毫秒）且禁止重定向；宿主工具回复等待 30 秒，单条模型工具结果约 1.125 MiB，JSONL 输入帧最多 5 MiB。模型超出步骤、截断响应或无有效最终答案均返回失败，不伪报完成。兼容服务可返回标准 JSON 或 SSE；SSE 需完成标记或 finish_reason。模型状态与工具历史只保留于本任务进程，长期聊天存储由宿主负责。

兼容网关请求携带 `stream_options.include_usage=true`，用量以网关收到的上游 usage 为准；Agent 不自行估算 token。`LMBOX_AGENT_REASONING_EFFORT` 可选配置推理强度，不配置时不发送该字段。
