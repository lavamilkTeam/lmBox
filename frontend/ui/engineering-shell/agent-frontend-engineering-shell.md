# 前端：工作区页签与功能库外观

先读 [前端结构](../../agent-frontend.md)。`index.ts` 公开 `EngineeringShell` 与 `ToolLibrary`，只接收显示数据并发送事件，不导入业务模块、协议、状态或平台。

`EngineeringShell` 通过 `tabs` 接收页签名称、ID 和固定标记，`active` 表示当前选中页；发送 `select` 与 `close` 事件，slot 容纳工作区。顶部使用共享 shadcn-vue 的 Tabs、TabsList、TabsTrigger、TabsContent；固定页签始终可见且不可关闭，动态页签横向滚动。关闭按钮位于标签按钮旁，避免嵌套交互控件；Delete 可关闭当前聚焦的动态页签，关闭后焦点回到活动页签。工作区内容与选中标签保持可访问性关联。钢网容器的可用高度在壳层内调整，不覆盖业务样式。

`ToolLibrary` 接收工具名称、分类与可用状态，提供搜索和分类列表；可用项发送 `open` 事件，未接入项禁用。工具数据、页签生命周期和页面选择属于 app；UI 不推断业务路由、不持有工程状态，也不添加常驻说明文案。

执行 `npm run check`，验证打开、去重、切换、关闭、键盘焦点和窄屏布局。
