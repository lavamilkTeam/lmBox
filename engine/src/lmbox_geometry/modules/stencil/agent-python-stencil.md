# Python：钢网业务模块与请求协调

先读 [语言说明](../../../../agent-python.md)；维护规则与隐私要求见根规范。

## 职责与边界

`__main__ → runner → modules.stencil.run → application`，协调单次请求内的建模、检查、格式选择与产物发布。

从四个 feature 的 `__init__.py` 公开入口调用；不访问私有算法。检查通过后才导出，失败不发布半成品。不承担 Rust 的队列、重试、取消或缓存策略。

## 行为约束

- 以版本化 JSONL 作为控制通道。`stdout` 只输出合法协议消息，诊断日志写 `stderr`；禁用会污染 `stdout` 的第三方进度条和打印。

- 每个请求和响应携带契约规定的协议版本、项目、任务及输入修订标识。协议版本不支持或输入不合法时，返回结构化错误；不得继续使用默认值计算。

- 临时产物写完并校验后再声明完成，失败时不得把半成品报告为成功。Rust 负责进程超时、取消、终止和目录清理；旧修订结果由 Rust 拒收。

- 所有示例结果必须标明来源，不能在计算失败时用示例几何冒充用户模型。

- `features/export_3d` 对已通过检查的网格生成 ASCII STL；`features/export_2d` 将同任务二维轮廓输出为 SVG/DXF，明确毫米单位。钢网导出接触面；底板轮廓仍由建模模块从顶面内侧 0.000001 mm 截面提取，包含槽和斜口，不将未加工板框替代实际结果。

## 验证

统一检查见 [语言说明](../../../../agent-python.md#验证与维护)。验证严格 JSONL、身份关联、不兼容输入、计算/检查/导出失败与原子发布顺序。

## 内部索引与公开入口

模块 `__init__.py` 提供 `run`、`build_preview`、`inspect_mesh`、`export_contours`、`export_mesh`；其余路径仅属本模块实现。调用者和测试从此入口访问，不跨业务导入内部 feature。

| 范围 | 说明 |
| --- | --- |
| `features/modeling/` | [几何建模](features/modeling/agent-python-stencil.md) |
| `features/inspection/` | [网格检查](features/inspection/agent-python-inspection.md) |
| `features/export_2d/` | [二维编码](features/export_2d/agent-python-export-2d.md) |
| `features/export_3d/` | [三维编码](features/export_3d/agent-python-export-3d.md) |
| `runtime/` | [产物 I/O](runtime/agent-python-artifacts.md) |
