# 前端：逻辑电路编辑功能

先读 [模块说明](../../../agent-frontend-digital-logic.md)。`index.ts` 只公开 `useCircuitEditing`，使用 domain 的目录与电路会话状态；不导入 app 或其他 feature，不包含图片、坐标绘制或样式。

添加、移动、连接、移除节点及移除连线均由本 feature 执行。允许重复门类型，位置必须有限并保留 24 的最小边距。一个输入只允许一个驱动，单输出可以扇出到多个命名输入；拒绝不存在的门/端口、自连接与反馈回路。删除节点清除其所有关联边。校验失败返回错误，由 app 呈现通知。

`tests/editing.test.ts` 从 feature 公开入口验证连接约束、清理与同一会话的编辑；`tests/digital-logic.pw.ts` 覆盖真实 UI 的点击/拖动接线、移动、缩放与键盘删除。运行 `npm run check`。
