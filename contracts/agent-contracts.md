# 跨语言协议结构与边界

先读 [根规范](../AGENTS.md) 和受影响语言说明；涉及代码/schema 设计应用 `$code-boundary-standards`。

根 `contracts` 是 Vue ↔ Rust ↔ Python 数据语义来源，只放版本化 JSON Schema、样例及说明，不实现业务。三端映射分别在 `frontend/contracts`、`src-rust/src/contracts`、`engine/src/lmbox_geometry/contracts`；当前使用手工映射和共享样例校验，未建立自动类型生成。将来生成文件需标注来源，不能手改。

| 模块 | 必读说明 |
| --- | --- |
| graphics v2 / 保留 v1 | [图形 IR](schemas/v2/agent-contracts-graphics.md) |
| import v1 | [导入](schemas/v1/agent-contracts-import.md) |
| preview v1 / 编辑与产物 | [预览](schemas/v1/agent-contracts-preview.md) |
| CEA v1（后端） | [热化学与理想火箭](schemas/v1/agent-contracts-cea.md) |
| propulsion v1 | [喷管与喷注器初算](schemas/v1/agent-contracts-propulsion.md) |
| CFD v1 | [原生流体分析会话](schemas/v1/agent-contracts-cfd.md) |
| fixtures | [兼容验证](fixtures/v1/agent-contracts-fixtures.md) |

不兼容变更提升主版本，不支持版本明确失败。现有协议不代表已实现工程持久化、完整 project/job、STEP 或切片。字段语义只更新所属 schema 模块说明，两端说明仅记录适配行为，不重复算法细节。
