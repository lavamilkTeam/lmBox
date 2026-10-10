# 前端：引导模块

先读 [前端结构](../../agent-frontend.md)。`index.ts` 只公开 `GuideWorkspace`；通过 `open(id)` 事件请求平台组装层打开已实现的工作区，不导入其他领域模块。

| 内部范围 | 说明 |
| --- | --- |
| `lib/app` | [界面协调](lib/app/agent-frontend-guide-app.md) |
| `lib/domain/flow` | [流程草稿](lib/domain/flow/agent-frontend-flow.md) |
| `lib/ui` | [功能库与画布](lib/ui/agent-frontend-guide-ui.md) |

启动默认显示引导界面。五项功能可以添加到画布；化学平衡和火箭发动机性能分析节点的打开按钮禁用并显示“未接入”，不能打开未实现页面。连线仅用于流程编排，不触发计算或传递工程数据。同一种功能可以添加多个节点，但打开的是该功能现有工作区，节点不拥有独立计算工程。

验证运行 `npm run check`。草稿规则通过 domain 公开入口测试；拖放、连接、删除、模块返回和窄屏操作通过 `tests/guide.pw.ts` 验证。
