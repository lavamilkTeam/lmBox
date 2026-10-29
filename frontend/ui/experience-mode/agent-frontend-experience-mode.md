# 使用方式选择外观

先读 [前端结构](../../agent-frontend.md) 和 [外观规范](../agent-frontend-ui.md)。公开 `ExperienceModeDialog`，不维护账户、模式选择或模块状态。

弹窗复用 shadcn Dialog；左右两张原生按钮卡片分别发送 `agent/advanced`，提供键盘操作及无障碍描述。窄屏改为上下排列，Agent 未可用时禁用对应选项。副标题只说明两种操作方式，不承诺 Agent 已能操作全部工程模块。开关受应用控制；关闭仍复用 Dialog 内置按钮与 Escape 行为。

两种使用方式复用工程壳层的页签与操作入口，由应用组装。验证运行 `npm run check`，检查窄屏边界、键盘选择和焦点。
