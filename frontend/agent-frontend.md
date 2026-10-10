# 前端结构与依赖边界

先读 [根规范](../AGENTS.md)，再按下表读受影响模块；代码和架构工作先应用 `$code-boundary-standards`。跨语言改动同时读另一端及 [共享协议](../contracts/agent-contracts.md)。

## 结构与所有权

前端源码位于 `frontend/`，按领域模块组织。`main.ts` 启动；平台 `app` 通过工程工具箱选择已实现模块；`modules/propulsion` 封装喷管和喷注器前端，数值仍由原生后端提供；`modules/stencil` 封装现有工作台，包含私有的应用协调、features、domain 和 UI。共享 `ui` 提供主题和基础控件；`platform` 适配桌面/浏览器外部交互；`contracts` 定义通信类型。只建立实际能力，不预建仿真占位模块。

## 依赖

- 平台 `app → modules/<name>/index.ts、ui`；当前钢网模块通过动态 import 加载。
- 领域模块互不导入，也不反向依赖平台 app；模块外禁止访问 `lib/` 和测试目录。
- 模块内部 `app → features/domain/ui`，也可使用共享 platform/ui/contracts；feature 之间不直接依赖。
- 模块 `domain → contracts` 及必要状态库，不依赖外部适配、UI、feature 或 app。Pinia store 使用领域前缀；钢网使用 `stencil-project`。
- 共享 `platform → contracts`，不依赖任何领域模块及其状态；Tauri API 仅允许在 `platform/desktop`。
- 共享及模块 UI 不依赖业务或状态；业务通过参数、插槽和事件连接 UI。共享主题与基础样式归 `ui/theme`，工作台样式归模块 `lib/ui` 并限定作用域。
- `contracts` 不依赖上述层。跨内部 feature/domain 和共享 UI/platform 仍须使用各自 `index.ts` 公开入口；dependency-cruiser 同时检查领域隔离、内部边界、反向依赖和循环。

## 模块索引

| 范围 | 必读说明 |
| --- | --- |
| `frontend/app` | [平台组装](app/agent-frontend-app.md) |
| `frontend/ui/installer-welcome` | [安装欢迎页](ui/installer-welcome/agent-frontend-installer-welcome.md) |
| `frontend/modules/cfd` | [流体分析模块](modules/cfd/agent-frontend-cfd.md) |
| `frontend/modules/propulsion` | [推进设计模块](modules/propulsion/agent-frontend-propulsion.md) |
| `frontend/ui/engineering-shell` | [工程工具箱](ui/engineering-shell/agent-frontend-engineering-shell.md) |
| `frontend/modules/stencil` | [钢网模块](modules/stencil/agent-frontend-stencil.md) |
| `frontend/modules/stencil/lib/app` | [工作台协调](modules/stencil/lib/app/agent-frontend-app.md) |
| `frontend/modules/stencil/lib/domain/project` | [工程快照与状态](./modules/stencil/lib/domain/project/agent-frontend-project-state.md) |
| `frontend/platform/desktop` | [浏览器与桌面适配](./platform/desktop/agent-frontend-desktop.md) |
| `frontend/contracts` | [前端协议映射](./contracts/agent-frontend-contracts.md) |
| `frontend/modules/stencil/lib/features/import-board` | [导入](./modules/stencil/lib/features/import-board/agent-frontend-import-board.md) |
| `frontend/modules/stencil/lib/features/export-parameters` | [参数导出](./modules/stencil/lib/features/export-parameters/agent-frontend-export-parameters.md) |
| `frontend/modules/stencil/lib/features/project` | [工程标签](./modules/stencil/lib/features/project/agent-frontend-project.md) |
| `frontend/modules/stencil/lib/features/preview` | [预览交互](./modules/stencil/lib/features/preview/agent-frontend-preview.md) |
| `frontend/modules/stencil/lib/features/stencil` | [建模与编辑设置](./modules/stencil/lib/features/stencil/agent-frontend-stencil.md) |
| `frontend/modules/stencil/lib/features/slicing` | [切片设置](./modules/stencil/lib/features/slicing/agent-frontend-slicing.md) |
| `frontend/modules/stencil/lib/features/logs` | [日志](./modules/stencil/lib/features/logs/agent-frontend-logs.md) |
| `frontend/ui/shadcn` | [shadcn-vue 基础组件](ui/shadcn/agent-frontend-shadcn.md) |
| `frontend/ui/theme` | [主题](ui/theme/agent-frontend-theme.md) |
| `frontend/modules/stencil/lib/ui` | [工作台样式](modules/stencil/lib/ui/agent-frontend-ui.md) |
| `frontend/ui` | [外观与样式](./ui/agent-frontend-ui.md) |
| `frontend/ui/icon-button` | [通用图标按钮](./ui/icon-button/agent-frontend-icon-button.md) |
| `frontend/ui/import-button` | [导入按钮外观](./ui/import-button/agent-frontend-import-button.md) |
| `frontend/ui/export-button` | [导出按钮外观](./ui/export-button/agent-frontend-export-button.md) |
| `frontend/ui/help-tip` | [辅助说明](./ui/help-tip/agent-frontend-help-tip.md) |
| `tests` | [浏览器集成测试](../tests/agent-frontend-tests.md) |

## 验证与维护

代码改动在根目录运行 `npm run check`（边界、单测、类型、构建和真实浏览器测试）。只把职责、公开接口、约束变化写入对应模块说明；结构或模块索引变化才更新本文件。文档整理检查链接、目录和职责一致性，不为文案增加测试。
