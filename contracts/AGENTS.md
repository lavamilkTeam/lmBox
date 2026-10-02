# 跨语言协议架构与注意事项

先读 [根规范](../AGENTS.md)，再读实际涉及的 [前端](../src/AGENTS.md)、[Rust](../src-tauri/AGENTS.md)、[Python](../engine/AGENTS.md) 说明。当前已有 `schemas/v2/graphics.schema.json` 、`schemas/v1/import.schema.json` 及 Rust/TypeScript 手工映射；project、job、artifact schema 和自动生成工具尚未实现。

## 所有权与结构

本目录负责 Vue ↔ Rust 及 Rust ↔ Python 的稳定数据约定，不包含计算或业务代码。采用版本化 JSON Schema 作为协议来源，三端的 wire types 按需生成或通过同一组协议样例验证，禁止各端分别发明字段含义。

```text
contracts/
├── AGENTS.md
├── schemas/v2/
│   ├── project.schema.json       # 工程快照、参数、版本
│   ├── graphics.schema.json      # Rust 解析后的统一图形 IR
│   ├── job.schema.json           # 请求、进度、完成、错误、取消
│   └── artifact.schema.json      # 轮廓、模型、路径产物清单
└── fixtures/v1/                  # 合法、非法、兼容性样例
```

生成代码的位置约定：前端 `src/contracts/`、Rust `src-tauri/src/contracts/`、Python `engine/src/lmbox_geometry/contracts/`。生成文件明确标记来源，修改 schema 后再生成；不要手改生成文件，也不要暴露第三方解析库的内部 AST 作为公共协议。

## 图形 IR

- Rust 负责源格式语法、状态与格式语义解释；Python 接收求值后的图元定义与有序绘制操作，不重新解析 Gerber/DXF 文本。
- 包含坐标单位、坐标系、原点、图层角色与原始文件/对象定位信息。统一长度单位为 mm；数值须有限，原始十进制输入的单位转换和允许误差明确记录，不以界面显示位数截断。
- 支持 flash、stroke、region、圆弧、孔径形状、变换和重复实例等必要语义，不能只支持矩形数组。
- 保留 dark/clear 极性及绘制顺序，保留宏内各基元的极性和顺序。Rust 求解宏参数/表达式，Python 做几何组合。不同于“把全部 dark 合并后再减去全部 clear”。
- 外环、内环、填充规则、圆弧中心/方向、整圆和镜像语义必须明确。重复图元可以共享定义并传实例，避免提前展开造成无界内存增长。
- 输入遇到未支持、会影响形状的命令时返回带文件定位的错误，不能静默丢弃后仍报告解析成功。
- 轮廓离散、布尔运算、补偿与网格容差由算法设置确定，不能由视图缩放决定。

## 请求、事件与产物

- 所有请求包含 `protocolVersion` 和可关联的请求标识。长任务还包含 `projectId`、`jobId`、`inputRevision`；响应/事件必须携带相同关联信息。
- 请求区分工程读取/修改、模型构建、检查、切片等业务操作；不提供任意 shell 命令或任意 Python 函数执行接口。
- 进度事件包含阶段及可用时的完成量；无法测量时不编造百分比。终态成功、失败、取消互斥且只确认一次。
- 错误使用稳定代码、简短消息和结构化上下文。完整技术诊断进入日志，不能用原始 traceback 填满用户面板。
- JSONL 标准输出仅传小型协议消息。大型 IR、二维轮廓、网格、STL、G-code 通过 Rust 分配的任务目录交换；结果以产物清单、校验摘要、格式版本引用。
- Python 仅访问本任务明确授权的输入/输出文件。前端使用 Rust 生成的产物标识，不自行拼接任意本地路径。
- 二维轮廓和三维模型来自同一个计算输入版本，记录算法版本、单位、容差及尺寸。切片结果记录所用模型摘要、切片配置和切片器版本。

## graphics v2

v2 为 stroke 增加起点，将 region 轮廓改为包含 `start` 和 `segments` 的对象，避免预览猜测起始坐标。该变更不兼容 v1，因此保留原 v1 schema，解析器输出与前端预览切换到 v2。缺少起点的 v1 数据不能无损推断，预览明确拒绝，不静默迁移。

## import v1

浏览器和未来原生适配共享文件级导入结果：`protocolVersion` 为 1，每层包含名称、原始大小、角色，以及互斥的 graphics v2 IR 或结构化诊断（代码、消息、可用时的行号）。Worker 信封附带请求 ID 用于匹配结果；该短请求不代表已建立工程/长任务协议。

## 当前验证范围

Rust 集成测试将示例、混合孔径、圆弧、区域和重复夹具的解析 JSON 交给 graphics schema 校验，并比较前端示例 JSON 与 Rust 解析结果。导入成功和失败样例同时按 import schema 与所引用的 graphics schema 校验。前端从 `src/contracts/index.ts` 使用类型；当前没有 Python 绑定或三端统一 fixture 验证，不能宣称已完成三端互通。

## 兼容性和验证

- 不兼容变更提升协议主版本；不支持的版本明确失败，不按默认值悄悄解释。
- 类型范围、缺失字段、未知枚举、非法数值和路径均按 schema 与任务规则校验。
- 同一 fixture 在三端接受/拒绝结果一致；几何语义还需行为测试，schema 校验不能代替几何正确性。
- 缓存键包含源文件摘要、图层选择、建模参数、解析器版本、算法版本和精度设置；切片另包含模型摘要、打印配置及切片器版本。显示参数不进入制造几何缓存键。
- 变更协议时一并更新受影响端和样例，并执行它们的检查；工具链尚未建立时明确记录，不能声称生成或互通已经通过。
