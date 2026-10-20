# 前端：数字逻辑电路编辑

先读 [前端结构](../../agent-frontend.md)。`index.ts` 仅公开 `DigitalLogicWorkspace`；内部实现及状态不供其他领域模块访问。

| 内部范围 | 说明 |
| --- | --- |
| `lib/app` | [工作区协调](lib/app/agent-frontend-digital-logic-app.md) |
| `lib/features/circuit-editing` | [电路编辑功能](lib/features/circuit-editing/agent-frontend-circuit-editing.md) |
| `lib/domain/circuit` | [电路草稿](lib/domain/circuit/agent-frontend-circuit.md) |
| `lib/ui` | [电路元件列表与画布](lib/ui/agent-frontend-digital-logic-ui.md) |

入口名称为“数字逻辑仿真”，当前实现为前端编辑页面：8 种逻辑门与 HD44780 字符屏的添加、移动、输入端连接、删除和会话草稿。没有计算执行、输入源、输出电平、时序结果或原生工程持久化，不提供仿真成功反馈。浏览器与整包桌面通过应用公开入口加载；模块安装分发尚未接入。

运行 `npm run check`，feature 测试验证端口/连线规则，浏览器测试验证真实共享组件交互与页签切换隔离。
