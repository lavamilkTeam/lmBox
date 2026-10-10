# Python 结构与依赖边界

先读 [根规范](../AGENTS.md)，再读受影响模块；应用 `$code-boundary-standards`。跨通信读 [协议](../contracts/agent-contracts.md)，跨进程/任务读 [Rust](../src-rust/agent-rust.md)。

## 结构与职责

`src/lmbox_geometry/modules` 按业务域分组，包括 `stencil` 和 `cfd`。业务模块内部 `features` 封装建模、检查和二维/三维编码，`application.py` 协调用例，`runtime` 管文件适配；外部只从模块 `__init__.py` 调用公开入口。共享 `contracts` 仍放在包根，负责库无关数据和跨语言 schema。保留现有 Python 包名和 JSONL 进程协议。

Python 接收 Rust 已解析 IR，负责几何、补偿、轮廓、实体网格与检查；不再次解析源文件，不管理工程队列/缓存/切片。当前支持模型及 STL/SVG/DXF；STEP 和切片未实现。CFD 通过独立原生控制器会话适配，不复用钢网 JSONL 任务协议。

## 依赖

`__main__ → runner → modules/stencil 的公开入口 → application → features/runtime → contracts`。四个 feature 相互独立，不依赖 application/runtime/通信信封。编码属于导出 feature，文件写入属于 runtime，格式选择属于 application。

跨业务模块只能经公开入口，不能导入另一模块的内部 feature；跨模块流程由外层 runner 协调。第三方对象不跨公共数据边界，不建立泛化 utils/common 容器。import-linter 保留 feature 独立性、私有实现保护，并约束进程适配不能直接导入钢网内部实现。

`cfd_worker → modules/cfd 的公开入口 → application → runtime`；CFD 的 FreeCAD、Qt、Docker 和原生文件适配全部归私有 `runtime`，不向共享协议暴露第三方对象。

## 模块索引

| 范围 | 必读说明 |
| --- | --- |
| `src/lmbox_geometry/modules/stencil/` | [钢网协调及内部索引](src/lmbox_geometry/modules/stencil/agent-python-stencil.md) |
| `src/lmbox_geometry/modules/cfd/` | [CFD 原生控制器适配](src/lmbox_geometry/modules/cfd/agent-python-cfd.md) |
| `src/lmbox_geometry/contracts/` | [共享协议](src/lmbox_geometry/contracts/agent-python-contracts.md) |
| `pyproject.toml 的 bundle 配置` | [引擎打包](agent-python-bundle.md) |

## 验证与维护

首次安装运行 `npm run setup:geometry`，代码改动运行 `npm run check:geometry`；跨端另运行 Rust 检查与 `npm run check`。测试从公开入口和进程协议验证单位、极性、圆弧、编辑、无效轮廓、二维三维一致性、网格及错误，使用仓库夹具。算法或输出依赖变化更新算法版本/缓存失效信息。具体规则只更新所属模块，本文件只维护结构和边界。
