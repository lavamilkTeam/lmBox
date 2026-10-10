# JavaScript 工具：发布产物校验

先读 [语言说明](agent-javascript.md)；维护规则与隐私要求见根规范。

## 职责与边界

范围：release-assets.mjs/release-assets.check.mjs。

只能收集规定平台的完整安装器，验证版本、来源提交和 SHA-256；拒绝重复、空、缺失或被修改的文件，已发布版本不覆盖。发布授权和门禁见质量规范。

## 验证

按实际改动运行对应 npm 脚本；发布资源边界运行 `node --test scripts/release-assets.check.mjs`。跨语言/打包同时执行涉及端的模块检查。
