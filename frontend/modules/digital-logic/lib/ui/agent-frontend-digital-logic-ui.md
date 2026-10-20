# 前端：数字逻辑编辑器外观

先读 [模块说明](../../agent-frontend-digital-logic.md)。`index.ts` 公开模块内部 `LogicEditor` 及纯坐标查询 `circuitPorts`。组件只接收目录、节点和连线并发送操作事件，不导入 domain、feature 或 app。

左侧复用 [共享列表](../../../../ui/flow-editor/agent-frontend-flow-editor.md)，右侧复用同一共享画布。`CircuitSymbol.vue` 封装无边框元件图片及输入开关、时钟、D 触发器、探针的原创内联 SVG，画布不显示卡片、页脚或关闭按钮；名称通过可访问标签和悬停标题提供。聚焦符号后 Delete/Backspace 请求删除，方向键请求移动。输入开关的切换按钮与移动按钮并列，不嵌套按钮或在 UI 中修改输入状态。

原始 SVG 及 [来源](assets/sources.json)、[授权](assets/NOTICE.txt) 保存在本 UI 的 `assets`，`symbols.ts` 私有管理 URL 和引脚显示坐标。逻辑门原图为 100×50，显示为 200×100；输入/输出端坐标跟随 SVG 实际线端，包括单输入门与缓冲器的端点偏移。通过共享画布的 `ports` 与 `node` 插槽提供显示数据及符号；引脚、连线预览和最终折线使用一致端点，无箭头。

`circuitPorts` 接收元件 ID 和输入名称，返回画布单位的局部输入/输出坐标；显示几何与 app 注入 feature 的吸附查询共用这一来源，不公开素材 URL。输入开关和时钟没有输入，输出为 `(190, 50)`；D 触发器的 D/CLK 输入分别为 `(10, 30)`、`(10, 70)`，输出为 `(190, 50)`；探针 A 输入为 `(10, 50)`，无输出。上述元件均显示为 200×100。

HD44780 使用原创 `assets/hd44780.svg`，显示为 600×280，完整绘制 16 个物理引脚；11 个数字接线点位于顶部焊盘中心，标记 `side: top`，输出坐标为 null。电源、对比度和背光引脚仅作外观。真实快照的两行字符覆盖在图中 `(59, 95, 482, 114)` 的显示窗口；`cursor` 按行优先的 0–31 位置绘制下划线并提供行列标签，不模拟闪烁。没有快照或 `displayOn: false` 时留空，不预置示例字符。吸附决策及节点位置更新仍由 circuit-editing feature 负责。

`LogicEditor` 接收 `simulation` 展示状态，发送 `simulationToggle`、`simulationStep`、`simulationReset`、`inputToggle` 事件。私有 `simulation-view.ts` 只描述呈现需要的字段，UI 不依赖协议、状态或计算实现。固定高度工具栏显示运行/暂停、步进、复位、实际步数、忙碌状态和诊断入口；真实诊断复用共享 Popover，错误使用浮层反馈，计算结果变化和展开诊断不会移动画布。输出与探针直接显示快照的 `0/1/X/Z`，尚无结果显示 `—`，不在 UI 中推导逻辑值。

`simulation.highEdgeIds` 由功能层提供；UI 将对应连线映射为 `logic-wire-high`，通过共享画布的通用颜色变量显示绿色。选中高电平连线保持绿色并加粗，键盘焦点与点击命中区域保持不变；UI 不从电平重新计算连线状态。

支持点击输出再点击输入，以及从输出点拖到输入点；端口是符号引脚上的点。拖动符号移动电路节点，缩放仅变更画布呈现。连线约束由 feature 验证，UI 不计算逻辑值。宽屏左右布局，小屏沿用共享上下布局。

替换素材时核对渲染、来源、授权与校验值。运行 `npm run check`；`tests/digital-logic.pw.ts` 验证端点与实际图片引脚对齐、拖动连线，以及移动/缩放后的附着。

逻辑门列表通过 `FlowLibrary` 的 `tool-actions` 插槽呈现共享 `HelpDialog` 圆圈问号。说明内容与当前打开 ID 由 app 传入，`helpOpen` 事件交回 app；问号为添加按钮的兄弟控件，点击说明不添加或拖动节点。弹窗样式、键盘和焦点行为复用共享 UI。

弹窗通过 [教学素材公开入口](../../../../ui/logic-circuit-tutorial-gifs/agent-frontend-logic-tutorials.md) 按门 ID 选择 GIF，提供具体替代文本；图片下方呈现领域目录提供的中文介绍及原文来源链接。GIF 只说明该门的真值表，不表示当前电路执行结果。HD44780 归入“显示器”，说明弹窗复用原创引脚图并呈现当前能力限制。
