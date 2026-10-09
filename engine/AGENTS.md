**AI 仅可在真实目录结构变化时更新本文件标记内的目录树；其他规范、标题和文字一律禁止 AI 自行修改。**

# Python阅读入口

先读 [总规范](../AGENTS.md) 和 [结构与模块索引](agent-python.md)，再读索引中所有受影响模块的说明，才可修改代码。跨端变更同时阅读对应端。

职责、接口、约束变化只最小更新所属模块 MD；结构变化更新语言说明。本文件正文固定；细节在语言/模块说明中维护，目录树仅在真实路径变化时更新。

## 目录（仅此区块可随真实结构更新）

<!-- agent-directory:start -->
```text
engine/
├── .import_linter_cache
├── .pytest_cache
├── .ruff_cache
├── agent-python-bundle.md
├── agent-python.md
├── src/
│   └── lmbox_geometry/
│       ├── agent-python-runner.md
│       ├── contracts/
│       │   └── agent-python-contracts.md
│       ├── features/
│       │   ├── export_2d/
│       │   │   └── agent-python-export-2d.md
│       │   ├── export_3d/
│       │   │   └── agent-python-export-3d.md
│       │   ├── inspection/
│       │   │   └── agent-python-inspection.md
│       │   └── stencil/
│       │       └── agent-python-stencil.md
│       └── runtime/
│           └── agent-python-artifacts.md
└── tests/
```
<!-- agent-directory:end -->
