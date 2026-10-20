# 前端：逻辑门教学动画

先读 [前端结构](../../agent-frontend.md) 与 [共享 UI](../agent-frontend-ui.md)。`index.ts` 公开只读 `logicGateTutorials`，以逻辑门 ID 映射 Vite 静态导入的 GIF URL；调用方不直接拼接文件路径。映射不依赖领域模块或功能状态。

现有八张 800×640 GIF 保留在本目录，覆盖 AND、OR、NOT、NAND、NOR、XOR、XNOR、BUF 的二值输入组合；来源、授权与动画含义见 [NOTICE.txt](NOTICE.txt)。这些素材是规则示意，不是电路求值或时序结果。

[数字逻辑 UI](../../modules/digital-logic/lib/ui/agent-frontend-digital-logic-ui.md) 通过公开入口选择素材，交给 [共享说明弹窗](../help-dialog/agent-frontend-help-dialog.md) 呈现；仅打开弹窗时挂载对应图片。浏览器检查覆盖全部素材的对应关系、真实加载和关闭后移除，统一运行 `npm run check`。
