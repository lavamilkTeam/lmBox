# 前端：公共说明弹窗功能

先读 [前端结构](../../agent-frontend.md)。`index.ts` 公开 `useHelpDialog`，每次调用独立维护只读 `activeId`，通过 `setOpen(id, open)` 打开或关闭指定说明；旧弹窗的关闭事件不能关闭另一个说明。

模块 app 通过公开入口组装此功能与 [共享弹窗 UI](../../ui/help-dialog/agent-frontend-help-dialog.md)。说明内容由调用方所属领域提供，本 feature 不依赖领域模块、UI、平台或应用组装，不包含样式、文案或全局单例。

运行 `npm run check`；浏览器验证问号与添加操作隔离、键盘开关和关闭后的焦点归还。
