# 前端：推进设计模块

先读 [前端结构](../../agent-frontend.md)。`index.ts` 仅公开 `PropulsionWorkspace`，通过 `tool: nozzle | injector` 选择已实现工具；外部不得访问 `lib` 或状态。工程工具箱将两项归入“流体与动力”，不据此把通用热化学分析限定于推进业务。

| 内部范围 | 说明 |
| --- | --- |
| `lib/app` | [计算协调](lib/app/agent-frontend-propulsion-app.md) |
| `lib/domain/design` | [草稿与任务快照](lib/domain/design/agent-frontend-design.md) |
| `lib/features/nozzle` | [喷管参数与结果](lib/features/nozzle/agent-frontend-nozzle.md) |
| `lib/features/injector` | [喷注器参数与结果](lib/features/injector/agent-frontend-injector.md) |
| `lib/ui` | [外观及图形](lib/ui/agent-frontend-propulsion-ui.md) |

仅通过共享 platform/contracts/ui 的公开入口交互；不依赖钢网内部状态。物理计算和校验属于 Fortran/Rust，前端只做输入、单位显示、任务匹配与结果呈现。通过真实浏览器链路验证，统一运行 `npm run check`；本地服务须先 `npm run build:backend`。
