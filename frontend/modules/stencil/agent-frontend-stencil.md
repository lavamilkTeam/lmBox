# 前端：钢网领域模块

先读 [前端结构](../../agent-frontend.md)。公开入口 `index.ts` 仅导出 `StencilWorkspace`；外部不能访问 `lib/` 或其中的工程状态。

`lib/app` 组装工作台流程；`lib/features` 包含导入、参数导出、编辑、预览、切片设置、标签和日志；`lib/domain/project` 保存钢网参数与界面状态；`lib/ui` 管理工作台外观。内部模块索引与依赖见前端结构说明。

使用共享 UI、platform 和 contracts 的公开入口。参数导出格式由本模块的 export-parameters feature 组装，platform 只保存文本；真实计算仍交给 Rust。切片器尚未接入。

工作台 CSS 限定于 `.stencil-workspace`；共享主题由平台提供。独立 Pinia 标识为 `stencil-project`，其他领域不得借用它存储参数。异步加载通过 Vue 生命周期安装和移除本模块监听及任务。

验证执行 `npm run check`；浏览器测试经真实文件导入和用户操作进入模块，不绕过入口访问私有 store。
