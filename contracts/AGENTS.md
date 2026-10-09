**AI 仅可在真实目录结构变化时更新本文件标记内的目录树；其他规范、标题和文字一律禁止 AI 自行修改。**

# 共享协议阅读入口

先读 [总规范](../AGENTS.md) 和 [结构与模块索引](agent-contracts.md)，再读索引中所有受影响模块的说明，才可修改代码。跨端变更同时阅读对应端。

职责、接口、约束变化只最小更新所属模块 MD；结构变化更新语言说明。本文件正文固定；细节在语言/模块说明中维护，目录树仅在真实路径变化时更新。

## 目录（仅此区块可随真实结构更新）

<!-- agent-directory:start -->
```text
contracts/
├── agent-contracts.md
├── fixtures/
│   └── v1/
│       └── agent-contracts-fixtures.md
└── schemas/
    ├── v1/
    │   ├── agent-contracts-cea.md
    │   ├── agent-contracts-import.md
    │   └── agent-contracts-preview.md
    └── v2/
        └── agent-contracts-graphics.md
```
<!-- agent-directory:end -->
