# 前端：安装欢迎页

先读[前端说明](../../agent-frontend.md)。`index.ts` 只公开 `InstallerWelcome`，负责白底欢迎画面、字体、入场动画及按钮外观，通过共享 shadcn-vue Button 显示操作，不依赖领域模块或安装服务。

- 猪猪以 GIF 第一帧的 PNG 从左侧弹入；收到自身入场动画完成事件后才创建 GIF 图片，GIF 加载期间保留静止帧。文字从上方弹入，按钮随后出现。
- 开启减少动态效果时显示静止画面，不播放入场动画或 GIF。组件卸载时释放媒体偏好监听。
- `continue` 事件是下一步的公开接入点。本轮仅提供欢迎页，应用层尚未连接下一步，不下载或伪报安装成功。
- 素材及字体位于私有 `lib/assets`。GIF 原样保留，PNG 是其第一帧；字体为 Gen Jyuu Gothic Medium（思源柔黑体）的 WOFF2 子集，来源、许可与再生成方式见 `lib/assets/NOTICE.txt`。
- 验证首次入场时序、减少动态效果及窄屏显示；执行 `npm run check` 和 `npm run build:installer`。
