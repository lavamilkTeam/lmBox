# 前端：平台组装

先读 [语言说明](../agent-frontend.md)。`main.ts` 创建 Vue 与 Pinia；`app/App.vue` 安装共享主题，通过领域模块公开入口异步加载工作区。

平台不访问领域模块的私有 feature、store 或 UI；现有导入、模型任务、导出及快捷键协调属于钢网模块。`App.vue` 保留功能目录、异步工作区组装及跨模块调用；[工作区页签 feature](features/workspace-tabs/agent-frontend-workspace-tabs.md) 通过公开入口维护打开、切换、去重和关闭确认状态，页签外观与焦点呈现归[工程工具箱 UI](../ui/engineering-shell/agent-frontend-engineering-shell.md)。流体力学的关闭处理器由应用注入，通过 CFD 公开入口释放原生会话。

页签只代表模块入口，不拥有独立工程；切换卸载原工作区的监听，领域会话由各自模块保存，普通功能关闭页签不清空工程草稿。刷新重置打开的页签。数字逻辑入口通过模块公开入口加载前端电路编辑器，不包含求值任务。功能库列出已实现入口，未接入功能禁用，不加载占位工作区。

独立安装预览由根 `installer.html → frontend/installer.ts → InstallerApp.vue` 启动，组装共享主题与[安装欢迎 UI](../ui/installer-welcome/agent-frontend-installer-welcome.md)，不加载工作台、Pinia 或计算服务。欢迎页下一步尚未接入。

验证执行根目录 `npm run check`，确认异步工作区加载、共享主题、真实导入及建模流程。

ComfyUI与 Agent通过各自公开入口加载；关闭或切换页签保留领域会话，重新进入恢复任务查询，关闭页签不等同取消原生任务。

Agent 已安装且可用时，其他页签通过工程壳层的 `assistant` 插槽挂载 `sidebar` 模式；展开事件由应用打开或选中 Agent 页签。完整工作区与侧栏模式互斥挂载，复用模块会话，应用不读取 Agent 私有状态。未安装时不挂载或请求 AI 服务。

喷注器功能暂不开放：功能库及引导目录不提供入口，也不加载对应工作区。

`module-entries` 是应用层分发入口，仅从领域模块公开入口导出工作区；nozzle/injector 是共用推进 UI 的两个功能入口。模块版启动经 platform/desktop 读取已安装 ID，功能库和引导节点由应用注入实际可用性；未安装功能不能打开。普通浏览器及整包桌面沿用已实现功能目录。

通过壳层 `account` 插槽挂载 [账户弹窗](../ui/account-dialog/agent-frontend-account-dialog.md)。应用接收登录/注册提交、邮箱验证码请求及第三方登录/可选绑定动作，并提供错误状态；统一账户服务尚未接入时仅显示不可用错误，不发送凭据或模拟成功。

完整应用当前按访客启动，通过 [使用方式 feature](../features/experience-mode/agent-frontend-experience-mode.md) 自动打开双卡片选择。两种模式复用同一工程壳层，保留顶部页签、模式切换和账户入口。轻松模式打开或选中 Agent 页签，主体只挂载完整 Agent；切回专业模式恢复先前的工作区，选择其他页签或关闭活动 Agent 页签也回到专业模式。工作区页签与领域会话留在现有所有者，不因布局切换清空。Agent 未安装时禁用轻松模式。弹窗归 [使用方式 UI](../ui/experience-mode/agent-frontend-experience-mode.md)。真实账户会话尚未接入，不能声称已检测云端登录；使用方式不决定存储位置，数据边界与后续接入见 [云端与本地数据](../../docs/cloud-local-data.md)。

Agent 网页专用入口 `WebAgent.vue` 只通过公开入口组装 Agent 与共享主题，不引用整包功能目录；打包和服务边界见 [Agent 网页发布](../../scripts/web-agent/agent-javascript-web-agent.md)。
