# Python 视频执行模块

`__init__.py` 仅公开 `execute(request, workspace, cancel, progress)`；`application.py` 协调校验、提交、轮询和产物下载。`features` 只处理节点目录投影及 lmBox 图到 ComfyUI prompt 的转换；`runtime` 私有适配 HTTP、凭据和作业产物。模块不导入 Agent 或其他业务实现。

ComfyUI 作为独立本地服务运行，推理由工作流中的云 API 节点提供；本模块不安装模型或假定本地 GPU。宿主环境提供 `LMBOX_COMFYUI_URL`、可选服务鉴权 `LMBOX_COMFYUI_API_KEY`、官方 Partner 节点凭据 `LMBOX_COMFY_PARTNER_API_KEY`。自定义 API 节点可使用 `LMBOX_COMFY_NODE_CREDENTIALS` JSON 映射，结构为节点类型到凭据字段；仅接受 api_key、auth_token、access_token、password、secret、authorization 等字段及分隔符/大小写变体。使用该映射前必须通过服务端 system_stats 验证 `--disable-metadata` 启动参数，避免标准输出节点把带凭据的 prompt 嵌入视频；未满足时不提交工作流。Partner extra_data 鉴权不受该要求影响。凭据不能由工作流提交，不进入目录默认值、错误或产物描述。

工作流限制 512 个节点；拒绝悬空连接、类型不兼容、环、缺失输入和不可用节点。ComfyUI `/object_info` 是实际节点和参数来源，`/prompt` 仍执行服务端校验；未知自定义控件及动态输入可能被明确拒绝，不推断成功。原始数组会被 ComfyUI 解释为连接，因此只能提交经过校验的显式连接对象，不能用数组字面量绕过图校验。输出从作业历史中的文件描述下载，每件最多 32 MiB、合计 128 MiB、最多 32 件，以随机标识保存在 Rust 分配的作业目录。

节点目录兼容传统枚举及 V3 COMBO options。V3 DynamicCombo 保留父级选项，按选中分支展开点分隔的输入名；仅用元数据中实际默认值或首个枚举补齐遗漏的嵌套必需字面量，必需连接仍须明确提供。高级嵌套设置通过 API JSON 导入，未知或未激活分支字段被拒绝。保存文件名去除跨平台禁用字符并限制为 255 UTF-8 字节，保留有效扩展名。

取消只针对本作业 ID：优先调用 `/api/jobs/{id}/cancel`，旧服务仅删除指定排队任务。派发成功后继续核对中断历史或任务离开本地队列，不能把派发成功直接当作终态。不会调用全局 interrupt；不能确认停止时返回 `cancellation_unconfirmed`。本地 ComfyUI 停止不保证上游云任务取消，终态消息保留该区别。轮询或超时后无法确认停止时返回 `remote_job_unconfirmed`。当前以历史轮询提供任务阶段，不提供逐采样步进度或断线恢复。

提交过程中连接中断或响应损坏返回 `submission_unconfirmed`，提示先核查 ComfyUI 队列再重新提交；不自动重试，避免已入队的付费云任务重复执行。

验证运行 `npm run check:ai` 和 `npm run check:geometry`。`engine/tests/test_ai.py` 使用明确的本地协议夹具验证提交、图校验、产物、凭据及取消；夹具不证明云模型生成能力。
