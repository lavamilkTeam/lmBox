# JavaScript 工具：桌面构建适配

先读 [语言说明](agent-javascript.md)；维护规则与隐私要求见根规范。

## 职责与边界

范围：desktop.mjs/archive-desktop.mjs。

显式定位 desktop/tauri 与前端目录，保持 CLI 参数、资源映射、执行权限及符号链接；不复制核心业务或协议。

## 验证

按实际改动运行对应 npm 脚本；发布资源边界运行 `node --test scripts/release-assets.check.mjs`。跨语言/打包同时执行涉及端的模块检查。
