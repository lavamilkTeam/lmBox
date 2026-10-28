# Python 工作 Agent 模块

此实现保留用于旧 worker 入口及兼容测试。lmBox 开发与桌面宿主的默认 Agent 已接入 [TypeScript ConeCode worker](../../../../../agent/agent-typescript.md)，任务与工具权限由 Rust 管理。

`__init__.py` 仅公开 `execute(request, workspace, cancel, progress, context=None)`；`application.py` 协调模型、工具和文件，`features` 提供有界算术，`runtime` 私有适配 LangGraph、兼容 Chat Completions 的 HTTP 提供方和作业文件。第三方状态图不跨公共边界，模块不导入视频或其他业务实现。

Agent extra 固定 LangGraph 版本并要求 Python 3.10+；几何基础环境继续支持 Python 3.9。缺失依赖、模型或连接返回明确失败。配置来自宿主环境：`LMBOX_AGENT_BASE_URL`、`LMBOX_AGENT_MODEL`、`LMBOX_AGENT_API_KEY`；兼容本地服务可以不设密钥。inspect 通过 models API 验证模型可用性，不产生推理请求。

LangGraph 运行 model → tools → model 的有界循环，模型调用上限 1–32，每轮最多 8 个工具。仅公开 calculate、list_files、read_file、write_file；没有 shell、浏览器、任意文件或网络工具。算术只允许有限数值和限定运算符，不能执行 Python。输入文本文件最多 16 件、合计 1 MiB；文件工具只允许作业目录中的简单文件名和 UTF-8 文本，拒绝路径穿越与符号链接。内部最多 64 个文件、单件 1 MiB、合计 8 MiB。写入结果注册为可下载文本产物。

取消在模型调用前后及工具之间检查，宿主负责超时和进程回收。提供方请求具有超时和体积限制，不向界面回传鉴权数据或原始错误响应。不提供图恢复或其他模块自动操作。

继续对话由 Rust 根据成功且同工程的父任务构造文本历史，放在私有 worker 信封的 `context` 中；公开 payload 仅提供父任务标识，不能提交消息角色。Python 再校验最多 20 组完整 user/assistant 对话、合计 128 KiB UTF-8 文本，拒绝 system/tool 角色、不完整顺序及额外字段。模型消息顺序为系统指令、历史文本、本轮问题。历史不包含工具记录或附件内容，也不复制此前工作目录；系统指令明确此前文件不在本轮目录，工具仅能访问本轮附件和产物。

验证运行 `npm run check:ai` 和 `npm run check:geometry`。`engine/tests/test_ai.py` 通过模块公开入口和兼容 HTTP 夹具运行真实 LangGraph，覆盖工具结果、产物、有界步骤、路径和执行限制；不使用模拟 LangGraph 替代真实库。
