# 前端结构与依赖边界

先读 [根规范](../AGENTS.md)，再按下表读受影响模块；代码和架构工作先应用 `$code-boundary-standards`。跨语言改动同时读另一端及 [共享协议](../contracts/agent-contracts.md)。

## 结构与所有权

Vue/TypeScript 使用 Feature-first。`main.ts` 启动，`app` 组装；`ui` 封装外观与全部样式，`features` 封装功能；`domain` 保存状态，`platform` 适配外部系统，`contracts` 定义通信类型。业务组件通过 UI 组件的参数、插槽和事件连接外观，不能将业务逻辑下沉到 UI。只为已有用例建立模块，不预建空目录。

## 依赖

- `app → features/domain/platform/ui/contracts`。
- `features → domain/platform/ui/contracts`；feature 之间不直接依赖。
- `domain → contracts` 及必要状态库。
- `platform → contracts`；允许 domain 公开类型，不访问 store。
- `ui → 框架/样式/UI 库` 及其他 UI 模块的公开入口；不依赖业务层。
- `contracts` 不依赖上述层。

跨模块从 `index.ts` 等根级公开入口导入，禁止深导入 `lib/`、`tests/`，不能为测试扩大接口。Tauri API 只能由 platform 引入。现有 dependency-cruiser 规则不可弱化。

## 模块索引

| 范围 | 必读说明 |
| --- | --- |
| `src/app` | [应用组装](app/agent-frontend-app.md) |
| `src/domain/project` | [工程快照与状态](domain/project/agent-frontend-project-state.md) |
| `src/platform/desktop` | [浏览器与桌面适配](platform/desktop/agent-frontend-desktop.md) |
| `src/contracts` | [前端协议映射](contracts/agent-frontend-contracts.md) |
| `src/features/import-board` | [导入](features/import-board/agent-frontend-import-board.md) |
| `src/features/export-parameters` | [参数导出](features/export-parameters/agent-frontend-export-parameters.md) |
| `src/features/project` | [工程标签](features/project/agent-frontend-project.md) |
| `src/features/preview` | [预览交互](features/preview/agent-frontend-preview.md) |
| `src/features/stencil` | [建模与编辑设置](features/stencil/agent-frontend-stencil.md) |
| `src/features/slicing` | [切片设置](features/slicing/agent-frontend-slicing.md) |
| `src/features/logs` | [日志](features/logs/agent-frontend-logs.md) |
| `src/ui` | [外观与样式](ui/agent-frontend-ui.md) |
| `src/ui/icon-button` | [通用图标按钮](ui/icon-button/agent-frontend-icon-button.md) |
| `src/ui/import-button` | [导入按钮外观](ui/import-button/agent-frontend-import-button.md) |
| `src/ui/export-button` | [导出按钮外观](ui/export-button/agent-frontend-export-button.md) |
| `src/ui/help-tip` | [辅助说明](ui/help-tip/agent-frontend-help-tip.md) |
| `tests` | [浏览器集成测试](../tests/agent-frontend-tests.md) |

## 验证与维护

代码改动在根目录运行 `npm run check`（边界、单测、类型、构建和真实浏览器测试）。只把职责、公开接口、约束变化写入对应模块说明；结构或模块索引变化才更新本文件。文档整理检查链接、目录和职责一致性，不为文案增加测试。
