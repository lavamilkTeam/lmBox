**AI 仅可在真实目录结构变化时更新本文件标记内的目录树；其他规范、标题和文字一律禁止 AI 自行修改。**

# Rust 核心阅读入口

先读 [总规范](../AGENTS.md) 和 [结构与模块索引](agent-rust.md)，再读索引中所有受影响模块的说明，才可修改代码。跨端变更同时阅读对应端。

职责、接口、约束变化只最小更新所属模块 MD；结构变化更新语言说明。本文件正文固定；细节在语言/模块说明中维护，目录树仅在真实路径变化时更新。

## 目录（仅此区块可随真实结构更新）

<!-- agent-directory:start -->
```text
src-rust/
├── src/
│   ├── bin/
│   │   └── agent-rust-preview-cli.md
│   ├── contracts/
│   │   └── agent-rust-contracts.md
│   ├── modules/
│   │   ├── cfd/
│   │   │   ├── app/
│   │   │   ├── runtime/
│   │   │   └── agent-rust-cfd.md
│   │   ├── propulsion/
│   │   │   ├── app/
│   │   │   │   ├── agent-rust-propulsion.md
│   │   │   │   └── agent-rust-thermochemistry.md
│   │   │   ├── features/
│   │   │   │   └── thermochemistry/
│   │   │   │       └── agent-rust-thermochemistry.md
│   │   │   ├── runtime/
│   │   │   │   ├── cea/
│   │   │   │   │   └── agent-rust-cea.md
│   │   │   │   └── design/
│   │   │   │       └── agent-rust-propulsion.md
│   │   │   └── agent-rust-propulsion.md
│   │   └── stencil/
│   │       ├── app/
│   │       │   └── agent-rust-app.md
│   │       ├── features/
│   │       │   ├── board_import/
│   │       │   │   ├── parser/
│   │       │   │   │   └── agent-rust-parser.md
│   │       │   │   └── agent-rust-board-import.md
│   │       │   └── modeling/
│   │       │       └── agent-rust-stencil.md
│   │       ├── runtime/
│   │       │   └── agent-rust-python.md
│   │       └── agent-rust-stencil.md
│   └── agent-rust-browser.md
└── agent-rust.md
```
<!-- agent-directory:end -->
