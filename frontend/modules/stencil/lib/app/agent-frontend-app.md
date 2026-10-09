# 前端：应用组装

先读 [语言说明](../../../../agent-frontend.md)；维护规则与隐私要求见根规范。

## 职责与边界

覆盖模块内 `app/Workspace.vue` 和 `app/lib/`；组装 feature、连接事件与跨 feature 模型预览/导出流程。

依赖 `features/domain/platform/ui/contracts` 的公开入口。应用层不实现解析、制造算法或 feature 专有用例。主题、布局和 CSS 归 `ui`；工作台 CSS 位于模块 `ui/workspace.css`，共享主题由平台提供。

## 行为约束

- `app` 从 `platform/desktop` 加载示例 IR，传给 domain；预览组件通过 `demo` 事件请求应用层打开示例，不自行加载或跨 feature 调用。

- `app/lib/useModelPreview` 协调模型任务；`platform/desktop::generatePreview` 统一适配入口：浏览器向同源 `/api/preview` 发送版本化请求，桌面环境通过 Tauri IPC 使用同一协议。

- `useModelPreview` 在真实图层的二维/三维视图协调同一模型任务。过期网格立即清除，计算中显示原图和提示；只有当前成功结果可导出。每层局部优化覆盖整层默认优化；所有制造运算仍归 Python。

- `app/lib/useModelExport` 用独立任务身份重新计算并核对当前修订；改变文档/参数或卸载即取消。`platform/desktop` 校验结果并下载本地服务返回的 STL、SVG、DXF。SVG/DXF 为钢网接触面的二维轮廓，底板则为带卸板槽及斜口的顶缘截面；STL 包含完整孔壁/高度。

## 验证

统一检查见 [语言说明](../../../../agent-frontend.md#验证与维护)。验证导入/导出快捷键、拖放、关闭确认、模型任务取消与旧结果丢弃。
