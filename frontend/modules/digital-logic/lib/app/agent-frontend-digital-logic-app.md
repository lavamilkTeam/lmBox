# 前端：数字逻辑工作区协调

先读 [模块说明](../../agent-frontend-digital-logic.md)。`Workspace.vue` 通过 circuit-editing feature 公开入口取得电路元件目录、会话草稿与编辑操作，通过 UI 公开入口组装编辑器。添加、移动、连接和删除交给 feature，连接校验失败使用共享主题通知。

通过 circuit-simulation 公开入口组装仿真，注入平台 `createDigitalLogicSession` 和每步间隔 200 ms 的调度器；该间隔只控制界面播放速度，不代表硬件频率。仿真结果和控制事件传给 UI。视图卸载暂停运行，普通页签关闭不清空草稿或 Rust 会话；重新打开恢复同一 Pinia 会话，刷新页面清空。这里不实现样式、图形绘制或逻辑求值。

通过 UI 公开的 `circuitPorts` 向 circuit-editing 注入端口几何，使水平吸附使用实际显示的引脚位置；app 不复制坐标或计算吸附规则。

逻辑门说明的开关通过 [公共 help-dialog feature](../../../../features/help-dialog/agent-frontend-help-dialog.md) 协调，并把当前说明 ID 与事件传给 UI；说明内容随领域目录传入。弹窗状态随工作区卸载清理，不改变电路草稿。

验证统一执行 `npm run check`。
