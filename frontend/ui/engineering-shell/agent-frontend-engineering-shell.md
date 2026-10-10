# 前端：工程工具箱外观

先读 [前端结构](../../agent-frontend.md)。`index.ts` 公开 `EngineeringShell`，通过 props 接收工具名称、分类和选中项，通过 `select` 事件通知应用，slot 容纳工作区。

不导入业务模块、协议、状态或平台。分类数据归 app；工具箱只展示已经提供的入口。顶部条保留工作区高度，工具列表复用共享 shadcn-vue 的 Popover 与 Button，保留展开状态和当前页面标记；浮层处理外部点击、Escape 与焦点返回。钢网容器的可用高度在壳层内调整，不覆盖业务样式。

执行 `npm run check`，验证工具选择、模块返回与窄屏布局。
