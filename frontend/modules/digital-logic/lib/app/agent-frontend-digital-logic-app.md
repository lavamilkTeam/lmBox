# 前端：数字逻辑工作区协调

先读 [模块说明](../../agent-frontend-digital-logic.md)。`Workspace.vue` 通过 circuit-editing feature 公开入口取得逻辑门目录、会话草稿与编辑操作，通过 UI 公开入口组装编辑器。添加、移动、连接和删除交给 feature，连接校验失败使用共享主题通知。

视图卸载和普通页签关闭不清空草稿；重新打开恢复同一 Pinia 会话，刷新页面清空。这里不实现样式、图形绘制或逻辑求值。

逻辑门说明的开关通过 [公共 help-dialog feature](../../../../features/help-dialog/agent-frontend-help-dialog.md) 协调，并把当前说明 ID 与事件传给 UI；说明内容随领域目录传入。弹窗状态随工作区卸载清理，不改变电路草稿。

验证统一执行 `npm run check`。
