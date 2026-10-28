# 前端：共享说明弹窗

先读 [前端结构](../../agent-frontend.md) 与 [外观规范](../agent-frontend-ui.md)。`index.ts` 仅公开 `HelpDialog`；问号按钮、弹窗布局与样式归私有 `lib/`，不依赖功能、领域状态或平台。

组件接收 `open`、`title`、纯文本 `description`，通过 `update:open` 请求打开或关闭；状态由调用方 feature 管理。默认插槽承载可选的补充内容。圆圈问号触发按钮使用 `${title}说明` 作为可访问名称。

可选 `imageSrc` 与 `imageAlt` 在上方呈现教程图片，下方为标题和说明；只在打开状态挂载图片，关闭时移除，保留触发器实例。可选 `source` 包含来源标签和 URL，使用新窗口链接呈现。含图弹窗最大宽度为 720px，图片等比例适应容器；素材选择和说明内容仍由调用方提供。浮层由原语传送到页面根部，样式使用 `help-dialog-` 专属类名，不依赖父组件的 scoped 属性。

通过 [共享 shadcn 原语](../shadcn/agent-frontend-shadcn.md) 保留键盘触发、模态焦点约束、Escape 关闭和关闭后的触发器焦点归还。弹窗限制视口宽高，长内容可滚动；不在 UI 内存放具体功能说明或业务动作。

运行 `npm run check`，交互验证覆盖问号打开、关闭与焦点归还，以及窄屏可读性。
