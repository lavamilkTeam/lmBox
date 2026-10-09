# JavaScript 工具：构建与引擎环境

先读 [语言说明](agent-javascript.md)；维护规则与隐私要求见根规范。

## 职责与边界

范围：build-wasm/build-worker/check-worker/geometry-env。

只构建、定位工具链与固定资源；WASM 绑定和 Python bundle 为生成产物，不手改。WASM 绑定输出到 `frontend/platform/desktop/lib/generated/`。固定绑定/依赖版本与源码一致；搬移 worker 后检查真实请求、模型和 STL，不创建另一套协议。

## 验证

按实际改动运行对应 npm 脚本；发布资源边界运行 `node --test scripts/release-assets.check.mjs`。跨语言/打包同时执行涉及端的模块检查。
