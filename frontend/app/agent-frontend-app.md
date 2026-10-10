# 前端：平台组装

先读 [语言说明](../agent-frontend.md)。`main.ts` 创建 Vue 与 Pinia；`app/App.vue` 安装共享主题，通过领域模块公开入口异步加载工作区。

平台不访问领域模块的私有 feature、store 或 UI；现有导入、模型任务、导出及快捷键协调属于钢网模块。启动默认显示独立引导模块，节点打开事件仅由本层路由至已实现工作区；工具箱可返回引导界面，流程草稿由引导模块保留。工程工具箱提供“电子电气”的钢网入口及“流体与动力”的喷管/喷注器和计算流体力学入口；切换卸载原工作区的监听，领域会话由各自模块保存。不添加未实现的热化学页面占位入口。

独立安装预览由根 `installer.html → frontend/installer.ts → InstallerApp.vue` 启动，组装共享主题与[安装欢迎 UI](../ui/installer-welcome/agent-frontend-installer-welcome.md)，不加载工作台、Pinia 或计算服务。欢迎页下一步尚未接入。

验证执行根目录 `npm run check`，确认异步工作区加载、共享主题、真实导入及建模流程。
