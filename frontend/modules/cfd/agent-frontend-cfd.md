# 前端：计算流体动力学

先读 [前端结构](../../agent-frontend.md)。`index.ts` 仅公开 `CfdWorkspace`；外部不访问模块私有实现。

| 内部范围 | 说明 |
| --- | --- |
| `lib/app` | [会话与请求协调](lib/app/agent-frontend-cfd-app.md) |
| `lib/domain/session` | [版本化快照](lib/domain/session/agent-frontend-session.md) |
| `lib/features/tasks` | [原版任务面板事件](lib/features/tasks/agent-frontend-tasks.md) |
| `lib/features/document` | [模型树与属性编辑](lib/features/document/agent-frontend-document.md) |
| `lib/ui` | [控件、中文显示和几何视图](lib/ui/agent-frontend-cfd-ui.md) |

通过共享 contracts/platform/ui 的公开入口接入隐藏的 FreeCAD/CfdOF 会话。命令可用性、物性、网格、边界条件与求解流程以原版控制器为准；前端不重写 CFD 公式或推断原生状态。导入真实文档或几何，不创建示例替代输入。

运行 `npm run check`。CFD 工作流另需可用的真实 FreeCAD/CfdOF worker，缺失时如实显示错误。
