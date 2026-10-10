# CFD 会话协议

先读[共享协议](../../agent-contracts.md)。请求通过 `cfd-request.schema.json` 定义；响应信封与实际原生投影结构通过 `cfd-response.schema.json` 的局部 `$defs` 定义（对象属性、控件树、布局、几何、对话框、监控曲线及日志）。Vue/Rust 映射及 Python 原生界面投影为手工维护，不是生成类型。

- `projectId` 选择 Rust 所有的隔离会话；`requestId` 关联请求与响应。`expectedRevision` 必须匹配修改前的 Rust 版本；响应 `inputRevision` 回显请求版本，`revision` 是当前权威版本。轮询不递增输入版本。
- 操作集合固定，不接受 Python 源码、模块名、任意方法或 worker 可执行路径。`command` 只接收已登记原生命令 ID，`setField/clickField` 只作用于当前面板或对话框登记的控件 ID。
- `setField` 携带原生显示值及可选 `phase: input | commit`；枚举与标签页使用源选项索引，翻译仅作用于显示文本。原生数量字符串仍由 FreeCAD 解析；前端不重新实现单位和物理模型。
- `selectGeometry` 使用对象 ID 和 Face/Edge/Solid 等原生子元素名；它与 `selectObject` 均可带布尔 `append`，默认替换选择集。几何投影包含顶点、三角索引及各面的三角范围；三角下标不能替代几何引用。
- 属性投影按原生类型、组和只读状态生成。Link 为 `{objectId}`，LinkSub 另有 `subelements`；对应列表为数组，Vector 为 `{x,y,z}`，Map 为字符串映射。只能修改当前公开的属性。
- 请求按操作分别限制参数键，`command` 可带 `childCommandId`；普通 `dialogResponse` 仅接受 `dialogId/buttonId`。原生宿主选择路径通过独立 Rust 方法，不属于网页协议，不能伪造受信任标记。
- `importFile` 传文件名与 Base64 字节，Rust 校验格式/上限后暂存；不会接受前端文件系统路径。`exportDocument` 通过后续轮询在响应顶层 `artifact` 返回受控工程文件的名称与 Base64。文件上限 24 MiB，对应 Base64 上限 32 MiB，完整请求/响应单帧上限 36 MiB；导出和状态合计过大时明确失败。原生内部路径不跨文件适配边界。
- 未初始化失败省略 `state`，错误包含 `code/message`；状态存在时必须是完整投影，不能用空对象代替。`worker_stopped` 清除旧忙碌标记并明确提示未保存文档不可恢复；显式关闭后才能重新初始化。几何三角索引与面范围的交叉约束由平台校验，JSON Schema 的类型检查不能代替几何检查。
- 可能进入模态窗口或长操作的控件先确认排队，再通过轮询返回真实 `busy/pendingAction/lastAction`、对话框、日志和监控数据。确认排队不代表求解完成；对话框由用户按对应 ID 回答，不自动选择默认肯定答案。
- 状态中的命令、对象属性、控件树、逻辑可见性与启用状态来自 CfdOF 原生控制器。缺少依赖、非法输入、旧版本和执行失败必须返回明确错误，不生成替代工程或仿真结果。

验证涵盖身份/版本拒绝、导入文件边界、控件事件、原生面板联动、几何引用、保存重开及真实网格/求解。未实测平台或能力不得描述为可用。
