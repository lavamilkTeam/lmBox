# Rust：AI 任务与产物

先读 [Rust 语言说明](../../../agent-rust.md) 和 [共享协议](../../../../contracts/agent-contracts.md)。

`mod.rs` 只公开 `AiBackend`。`new(python, engine, root)` 接收可信源码环境路径，`bundled(worker, root)` 接收打包执行程序；`with_agent_worker(node, entry)` 为 Agent 指定可信 Node.js 与编译后的入口，视频继续使用原 Python worker；前端不能指定这些路径。`request(AiRequest)` 处理能力检查、启动、状态、取消和产物，`artifact_bytes(&AiRequest)` 为原生保存提供同样校验后的二进制；`close_all()` 永久关闭后端并等待子进程回收。

私有 `app` 拥有工程、输入版本、任务标识、状态、取消与产物注册；私有 `runtime` 处理 Python/Node 子进程和有界 JSONL。依赖为 `宿主/CLI → ai 公开入口 → app → runtime/contracts`。视频的模型执行保留在 Python；启用 Node worker 后，Agent 模型调用与循环由 [TypeScript Agent](../../../../agent/agent-typescript.md) 执行，未配置时保留 Python 兼容入口。Rust 不接收第三方对象。AI 模块仅原生编译，不影响 WASM 导入。

Agent 后续轮次的规则见 [AI 协议](../../../../contracts/schemas/v1/agent-contracts-ai.md)。每个保留任务保存其不可变历史快照；启动时验证父任务后，将该快照、父请求文字和最终回答组装为私有 worker `context`。较早祖先被淘汰不影响已保存的快照，但当前父任务必须仍可查询且成功。角色数据不接受客户端输入，历史仅在内存保留，文件和附件不跨任务复制。上下文校验在登记请求标记及启动进程前完成。

每个任务使用独立临时目录，最多两个活动执行（含能力检查）；保存最近 32 个任务，淘汰时清理目录。较旧输入版本不能重新启动，查询及产物必须匹配任务、工程、能力和原输入版本，结果只更新自己的任务。相同工程与请求标识的重试返回原任务；更改该请求的输入被拒绝。接收任务前在可信根目录的 requests 下以工程和请求标识原子创建空标记，不保存提示词、附件或凭据。标记在任务淘汰和后端重启后仍保留，最多 4096 条；超限时拒绝新任务，不自动清空旧标识。重启不恢复任务结果，旧请求返回 request_expired，不能重放生成。同一工程与能力只允许运行一个任务。状态事件最多 100 条，单条 4 KiB。请求上限 4 MiB，worker 单帧 12 MiB、总输出 64 MiB，检查限时 45 秒、任务限时两小时。取消或超时先发协议信号，视频任务等待 20 秒、其余请求等待 3 秒，未退出则终止本地进程；视频远端状态未确认时返回 `cancellation_unconfirmed`，不会假报取消成功。

只接受成功任务注册的 `artifacts/<id>` 普通文件；拒绝路径穿越、符号链接、重复 ID、空的非 text/plain 产物、单产物超过 32 MiB 、产物数超过 128 或总产物超过 128 MiB。公共传输返回有界 Base64，原生保存直接读取已注册字节。运行时 stderr 被排空但不返回前端，凭据和工作目录不出现在错误响应。关闭或宿主 EOF 后清理本进程的任务工作区，保留去重标记。

`tests/ai_tasks.rs` 经公开入口使用明确标识的隔离 Python 协议夹具，覆盖项目/版本隔离、产物读取、路径与大小拒绝、无效输出、并发、取消、重试去重、重启后的持久去重、历史容量、过期记录、共享 schema、打包入口与 CLI EOF 回收。按语言说明运行 fmt、Clippy、测试；真实模型环境与打包执行另由 Python/桌面检查验证。

## Node Agent 工具边界

Node worker 通过私有 JSONL `tool` 帧请求 `calculate`、`list_files`、`read_file`、`write_file`、`workspace_info`；Rust 回复关联同一 ID 的 `tool_result`。只在 Node Agent 的 start 阶段接收工具，拒绝重复 ID、未知帧、超量调用和超大输出；每任务最多为步骤预算乘以 8 次调用。工具名与参数在 Rust 校验，不开放 shell、网络、任意目录或跨工程状态。`workspace_info` 只返回可信请求的工程标识、输入版本、能力与可用工具，不含工作区路径。取消后不再执行工具。

私有 `tools` 保管本轮文本附件和工具文件；文件在任务内存中隔离，不按模型提供的名称直接访问磁盘。附件最多 16 件、合计 1 MiB；内部最多 64 件、单件 1 MiB、合计 8 MiB。文件名必须是简单名称，拒绝路径、重复附件及额外参数。只有成功任务通过 write_file 生成的文件由 Rust 写入新的 artifacts 目录，以独占创建生成注册 ID；Node 不得自行注册产物。创建冲突或符号链接目录导致失败。私有 `arithmetic` 解析有限值的加减乘除、整除、余数、乘方与括号，限制表达式长度和递归深度，不执行源代码。

Node 子进程是应用可信执行代码，不代表 OS 沙箱；工具限制约束模型操作，不能隔离恶意替换的 worker。启动清除继承的 NODE_OPTIONS 和 NODE_PATH；Node 与入口路径由宿主提供，不能由模型或前端指定。现有任务、上下文、取消、过期和产物规则不变。

`tests/ai_node.rs` 经 AiBackend 公开入口运行明确标识的 Node 协议夹具，验证工具结果与身份、文件产物、可信历史、算术限制、路径拒绝、重复调用、取消和附件限制；可用 LMBOX_TEST_NODE 指定测试解释器。模型集成由应用链路测试验证，不将协议夹具视为真实模型推理。
