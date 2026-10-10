# 前端：共享主题

先读 [语言说明](../../agent-frontend.md)。`index.ts` 公开 `AppTheme`，封装 Naive UI 的主题及对话框、消息 Provider；内容通过 slot 传入。

`lib/base.css` 只提供全局字体、基础控件和重置样式；不包含领域工作台选择器，也不依赖模块状态或平台适配。业务专属外观由所属模块 UI 维护。

验证执行 `npm run check`，通过工作台检查主题、提示、焦点和禁用控件。
