# 前端：钢网工作台样式

先读 [模块说明](../../agent-frontend-stencil.md)。`workspace.css` 保存现有工作台布局、画布、参数面板、日志的样式，选择器以 `:where(.stencil-workspace)` 限定作用域，保留原有选择器优先级。表单、按钮、标签、选择和关闭确认使用共享 `ui/shadcn`；本模块只补充工作台布局和紧凑尺寸。

样式在模块入口加载；不向全局注入领域选择器，不访问 store 或 IPC。全局基础样式和主题见 [共享主题](../../../../ui/theme/agent-frontend-theme.md)。

修改时通过浏览器检查宽窄窗口、预览和参数面板；不为纯样式编写复述 CSS 的测试。
