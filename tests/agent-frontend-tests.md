# 前端：浏览器集成测试

先读 [语言说明](../frontend/agent-frontend.md)；维护规则与隐私要求见根规范。

## 职责与边界

覆盖工作台公共行为与真实 Rust/Python 链路；夹具来自仓库，配置见 `playwright.config.ts`。

通过可见界面、下载和公开适配测试，不导入 feature 私有实现。UI 样式调整不新增复述 CSS 的测试；必要时验证焦点、提示、操作、取消和多文档隔离。

`installer.pw.ts` 使用独立安装预览服务验证静止入场后才请求 GIF、减少动态效果和窄屏按钮交互；两个前端服务由 Playwright 的 `webServer` 配置启动。

## 行为约束

在仓库根目录运行 `npm run check`。测试公共行为：多标签隔离、文件导入、视图切换、参数更新、关闭确认、事件取消及错误处理。后续原生接口测试使用 platform 适配替身，不直接 mock feature 私有实现。

- CI 使用 Chromium 软件 WebGL 运行真实建模测试，禁止 `test.only`、不通过重试掩盖失败，并保留失败 trace/截图。前端门禁覆盖边界、单元、类型、构建和端到端行为。

## 验证

统一检查见 [语言说明](../frontend/agent-frontend.md#验证与维护)。执行完整浏览器套件，保留失败 trace/截图；真实计算采用两个 worker，不用重试掩盖失败。

`propulsion.pw.ts` 验证工具箱、真实 Fortran 锥形/钟形和液体圆孔/环隙计算、三类收敛段、SVG 转义与 DXF 毫米坐标、JSON 导出身份配对、参数失效、迟到响应、错误恢复、模块返回和窄屏。运行前先构建 `npm run build:backend`；不以计算 mock 替代正常路径。

`cfd-native.pw.ts` 仅在 `LMBOX_CFD_INTEGRATION=1` 时运行，`LMBOX_CFD_TEST_FILE` 指向公开来源的纯几何 CAD 夹具。通过真实原生会话验证导入、物理模型动态控件、单位输入、属性回写与 FCStd 保存，并关闭测试自身的会话；不替换后端响应。

`guide.pw.ts` 覆盖默认启动、功能搜索与拖放、缩放坐标、指针和键盘移动、连线、删除及返回后的会话草稿。现有钢网测试通过 `workspace-navigation.ts` 从引导页节点进入工作区，其他工作区间的切换使用工具箱。
