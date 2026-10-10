# 前端：共享主题

先读 [语言说明](../../agent-frontend.md)。`index.ts` 公开 `AppTheme` 和 `useNotification`。`AppTheme` 提供共享 shadcn-vue 的提示 Provider 与 Sonner 通知；内容通过 slot 传入。通知入口仅提供 `success/error/warning/info(message)`，不决定业务结果。确认交互由调用方通过共享 `AlertDialog` 显式组装。

`lib/base.css` 提供灰阶主题 token、Tailwind 4 utilities、全局字体与基础控件重置；不启用影响画布和领域图形的完整 preflight。基础控件重置限定到 `data-slot` 原语，不包含领域工作台选择器，也不依赖模块状态或平台适配。业务专属外观由所属模块 UI 维护。

验证执行 `npm run check`，通过工作台检查主题、提示、焦点和禁用控件。
