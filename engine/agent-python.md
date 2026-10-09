# Python 结构与依赖边界

先读 [根规范](../AGENTS.md)，再读受影响模块；应用 `$code-boundary-standards`。跨通信读 [协议](../contracts/agent-contracts.md)，跨进程/任务读 [Rust](../src-rust/agent-rust.md)。

## 结构与职责

`src/lmbox_geometry` 按能力组织：`features` 封装建模、检查和二维/三维编码，`runner` 协调一次请求，`runtime` 封装文件适配，`contracts` 封装库无关数据和共享 schema 校验。每个包从 `__init__.py` 暴露少量稳定入口，`_` 前缀实现私有，不从根包转导出整棵子树。

各能力专有类型由本包公开入口提供；跨能力数据归 `contracts`，跨语言语义以根 schema 为准。

Python 接收 Rust 已解析 IR，负责图元几何、补偿、轮廓、实体网格与检查；不再次解析源文件，不管理工程、任务队列、缓存或切片进程。当前支持模型及 STL/SVG/DXF；STEP 和切片未实现，不预建空模块。

## 依赖

`__main__ → runner → features/runtime/contracts`；各 `feature → contracts`，`runtime → contracts`。四个 feature 相互独立，算法不依赖 runner/runtime/通信信封。格式编码属于导出 feature，文件写入属于 runtime，格式选择属于 runner。

第三方库调用和异常转换就近封装，不泄漏库对象；仅有真实复用时提取职责明确的模块，不建立泛化 utils/common 包。import-linter 的独立性和私有实现约束不可弱化。

## 模块索引

| 范围 | 必读说明 |
| --- | --- |
| `src/lmbox_geometry/runner.py、__main__.py` | [请求协调](src/lmbox_geometry/agent-python-runner.md) |
| `src/lmbox_geometry/features/stencil/` | [模板几何](src/lmbox_geometry/features/stencil/agent-python-stencil.md) |
| `src/lmbox_geometry/features/inspection/` | [网格检查](src/lmbox_geometry/features/inspection/agent-python-inspection.md) |
| `src/lmbox_geometry/features/export_2d/` | [二维编码](src/lmbox_geometry/features/export_2d/agent-python-export-2d.md) |
| `src/lmbox_geometry/features/export_3d/` | [三维编码](src/lmbox_geometry/features/export_3d/agent-python-export-3d.md) |
| `src/lmbox_geometry/runtime/` | [任务产物 I/O](src/lmbox_geometry/runtime/agent-python-artifacts.md) |
| `src/lmbox_geometry/contracts/` | [Python 协议映射](src/lmbox_geometry/contracts/agent-python-contracts.md) |
| `pyproject.toml 的 bundle 配置` | [计算引擎打包](agent-python-bundle.md) |

## 验证与维护

首次安装运行 `npm run setup:geometry`，代码改动运行 `npm run check:geometry`；跨端另运行 Rust 检查与 `npm run check`。测试从公开入口和进程协议验证单位、极性、圆弧、编辑、无效轮廓、二维三维一致性、网格及错误，使用仓库夹具。算法或输出依赖变化更新算法版本/缓存失效信息。具体规则只更新所属模块，本文件只维护结构和边界。
