# 前端：数字逻辑编辑器外观

先读 [模块说明](../../agent-frontend-digital-logic.md)。`index.ts` 公开模块内部 `LogicEditor` 及纯坐标查询 `circuitPorts`。组件只接收目录、节点和连线并发送操作事件，不导入 domain、feature 或 app。

左侧复用 [共享列表](../../../../ui/flow-editor/agent-frontend-flow-editor.md)，右侧复用同一共享画布。`CircuitSymbol.vue` 封装无边框元件图片，画布不显示卡片、页脚或关闭按钮；名称通过可访问标签和悬停标题提供。聚焦符号后 Delete/Backspace 请求删除，方向键请求移动。

原始 SVG 及 [来源](assets/sources.json)、[授权](assets/NOTICE.txt) 保存在本 UI 的 `assets`，`symbols.ts` 私有管理 URL 和引脚显示坐标。逻辑门原图为 100×50，显示为 200×100；输入/输出端坐标跟随 SVG 实际线端，包括单输入门与缓冲器的端点偏移。通过共享画布的 `ports` 与 `node` 插槽提供显示数据及符号；引脚、连线预览和最终折线使用一致端点，无箭头。

`circuitPorts` 接收元件 ID 和输入名称，返回画布单位的局部输入/输出坐标；显示几何与 app 注入 feature 的吸附查询共用这一来源，不公开素材 URL。HD44780 使用原创 `assets/hd44780.svg`，显示为 600×280，完整绘制 16 个物理引脚；11 个数字接线点位于顶部焊盘中心，标记 `side: top`，输出坐标为 null。电源、对比度和背光引脚仅作外观，液晶窗口保持空白。吸附决策及节点位置更新仍由 circuit-editing feature 负责。

支持点击输出再点击输入，以及从输出点拖到输入点；端口是符号引脚上的点。拖动符号移动电路节点，缩放仅变更画布呈现。连线约束由 feature 验证，UI 不计算逻辑值。宽屏左右布局，小屏沿用共享上下布局。

替换素材时核对渲染、来源、授权与校验值。运行 `npm run check`；`tests/digital-logic.pw.ts` 验证端点与实际图片引脚对齐、拖动连线，以及移动/缩放后的附着。

逻辑门列表通过 `FlowLibrary` 的 `tool-actions` 插槽呈现共享 `HelpDialog` 圆圈问号。说明内容与当前打开 ID 由 app 传入，`helpOpen` 事件交回 app；问号为添加按钮的兄弟控件，点击说明不添加或拖动节点。弹窗样式、键盘和焦点行为复用共享 UI。

弹窗通过 [教学素材公开入口](../../../../ui/logic-circuit-tutorial-gifs/agent-frontend-logic-tutorials.md) 按门 ID 选择 GIF，提供具体替代文本；图片下方呈现领域目录提供的中文介绍及原文来源链接。GIF 只说明该门的真值表，不表示当前电路执行结果。HD44780 归入“显示器”，说明弹窗复用原创引脚图并呈现当前能力限制。
