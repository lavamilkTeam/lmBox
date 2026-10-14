# JavaScript 工具：发布产物校验

先读 [语言说明](agent-javascript.md)；维护规则与隐私要求见根规范。

## 职责与边界

范围：release-assets.mjs/release-assets.check.mjs。

收集规定平台的完整安装器，以及独立模块 ZIP、原生下载安装器和待签名 catalog。`collect`/`assemble` 负责整包，`collect-modules`/`assemble-modules` 负责模块发布集。验证版本、来源提交、平台、公钥、完整包集合、唯一 UI 资源归属和 SHA-256；拒绝重复、空、缺失、额外或被修改的文件。

只有最终发布步骤读取 Ed25519 私钥；签名公钥须与每个平台安装器的构建清单和固定公开配置一致。签名覆盖 catalog 原始 payload 字节。所有 ZIP 与 catalog 加入同一 SHA256SUMS 和 release-manifest；已发布版本不覆盖。签名密钥不传给构建和测试，发布授权和门禁见[质量规范](../.github/QUALITY.md)。

## 验证

按实际改动运行对应 npm 脚本；发布资源边界运行 `node --test scripts/release-assets.check.mjs`。跨语言/打包同时执行涉及端的模块检查。
