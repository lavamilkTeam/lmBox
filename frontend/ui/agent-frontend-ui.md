# 前端：外观与样式

先读 [语言说明](../agent-frontend.md)；维护规则与隐私要求见根规范。

## 职责与边界

统一视觉组件、图标、主题、布局、CSS 和提示框；业务数据通过 props/插槽传入，操作通过事件传出。

所有新增或修改的样式封装在共享或所属领域模块的 `ui`，包括 scoped CSS、全局主题样式和内联视觉配置；不在 features/domain/platform 添加样式。`app` 只组装和引入 UI。UI 不访问工程 store、源文件、IPC 或算法，不包含导入/建模/切片逻辑。渲染交互所属边界见预览说明。

列表及画布复用归 [节点编辑 UI](flow-editor/agent-frontend-flow-editor.md)；逻辑门图片、引脚呈现和授权记录归 [数字逻辑模块 UI](../modules/digital-logic/lib/ui/agent-frontend-digital-logic-ui.md)。

[逻辑电路教学 GIF](logic-circuit-tutorial-gifs/agent-frontend-logic-tutorials.md) 通过公开入口提供 8 种逻辑门的真值表动画，每 1.4 秒展示一种输入组合，1 用绿色圆灯、0 用灰色圆灯表示。素材覆盖单输入门的 2 种及双输入门的 4 种组合，只用于规则教学；来源与授权见目录中的 [NOTICE.txt](logic-circuit-tutorial-gifs/NOTICE.txt)。

点击式圆圈问号与受控说明弹窗归 [说明弹窗 UI](help-dialog/agent-frontend-help-dialog.md)；开关状态由调用方通过公共 feature 协调。悬停式提示继续使用 [HelpTip](help-tip/agent-frontend-help-tip.md)。

## 行为约束

- 保持顶部导入和文件标签、左侧窄预览菜单、中央预览、右侧对应参数、底部日志的工作台布局。

- 界面主色使用黑、白、灰，顶部栏为白底深色文字，界面选中状态用明暗和边框区分；2D 图层保留蓝色焊盘及板框、上口轮廓等语义配色。预览保持纯黑背景；2D 与 G-code 使用低对比度主次网格，网格和刻度尺与模型同步缩放、平移；显示参数控制对应显示行为。

- 不重新加入开发状态文案、技术栈介绍、冗余说明块和装饰性状态灯。实际错误应简短、可操作。

- 示例用简短“示例”标识即可，不能在用户文件名下展示伪造模型。未实现的动作不能伪报成功。

## 验证

统一检查见 [语言说明](../agent-frontend.md#验证与维护)。查看实际外观及宽窄窗口；涉及交互时验证焦点、禁用和提示，不为文案或 CSS 增加复述测试。

共享基础控件使用 [shadcn-vue](shadcn/agent-frontend-shadcn.md) 的公开入口；已有 icon/import/export/help 外观入口继续复用这些控件，业务调用方不访问其私有源码。
