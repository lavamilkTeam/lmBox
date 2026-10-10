# JavaScript 工具：开发计算适配

先读 [语言说明](agent-javascript.md)；维护规则与隐私要求见根规范。

## 职责与边界

范围：preview-api.ts。

只在本地启动受控 Rust 预览 CLI，最多两个并发任务；校验取消、输出大小和错误，制造业务仍归 Rust/Python。静态部署不伪报有计算服务。

前端使用固定端口 `6522`，绑定 `127.0.0.1`，端口占用时失败，不自动切换；Vite 忽略构建、测试及求解器产物，避免输出文件使活动工程刷新；`npm run dev` 在浏览器中开发，`npm run desktop:dev` 在 Tauri 窗口中开发，二者择一启动。桌面入口见[桌面打包说明](../desktop/tauri/agent-rust-packaging.md)。

## 验证

按实际改动运行对应 npm 脚本；发布资源边界运行 `node --test scripts/release-assets.check.mjs`。跨语言/打包同时执行涉及端的模块检查。
