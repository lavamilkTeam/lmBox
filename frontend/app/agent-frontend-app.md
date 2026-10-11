# 前端：平台组装

先读 [语言说明](../agent-frontend.md)。`main.ts` 创建 Vue 与 Pinia；`app/App.vue` 安装共享主题，通过领域模块公开入口异步加载工作区。

平台不访问领域模块的私有 feature、store 或 UI；现有导入、模型任务、导出及快捷键协调属于钢网模块。`App.vue` 保留功能目录、异步工作区组装及跨模块调用；[工作区页签 feature](features/workspace-tabs/agent-frontend-workspace-tabs.md) 通过公开入口维护打开、切换、去重和关闭确认状态，页签外观与焦点呈现归[工程工具箱 UI](../ui/engineering-shell/agent-frontend-engineering-shell.md)。流体力学的关闭处理器由应用注入，通过 CFD 公开入口释放原生会话。

页签只代表模块入口，不拥有独立工程；切换卸载原工作区的监听，领域会话由各自模块保存，普通功能关闭页签不清空工程草稿。刷新重置打开的页签。功能库列出已实现入口，未接入功能禁用，不加载占位工作区。

独立安装预览由根 `installer.html → frontend/installer.ts → InstallerApp.vue` 启动，组装共享主题与[安装欢迎 UI](../ui/installer-welcome/agent-frontend-installer-welcome.md)，不加载工作台、Pinia 或计算服务。欢迎页下一步尚未接入。

验证执行根目录 `npm run check`，确认异步工作区加载、共享主题、真实导入及建模流程。

视频工作流与 AI 工作助手通过各自公开入口加载；关闭或切换页签保留领域会话，重新进入恢复任务查询，关闭页签不等同取消原生任务。
