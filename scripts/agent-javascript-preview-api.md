# JavaScript 工具：开发计算适配

先读 [语言说明](agent-javascript.md)；维护规则与隐私要求见根规范。

## 职责与边界

范围：preview-api.ts。

只在本地启动受控 Rust 预览 CLI，最多两个并发任务；校验取消、输出大小和错误，制造业务仍归 Rust/Python。静态部署不伪报有计算服务。

## 验证

按实际改动运行对应 npm 脚本；发布资源边界运行 `node --test scripts/release-assets.check.mjs`。跨语言/打包同时执行涉及端的模块检查。
