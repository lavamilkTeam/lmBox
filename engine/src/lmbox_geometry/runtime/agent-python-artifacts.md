# Python：任务产物 I/O

先读 [语言说明](../../../agent-python.md)；维护规则与隐私要求见根规范。

## 职责与边界

`artifacts.py` 读取任务输入、包装 `{format, content}` 并原子写入固定产物。

仅接受 Rust 分配的任务目录与受控名称，不依赖 feature，不做格式选择/编码或制造运算。失败输出不能被当作完成产物。

## 行为约束

- 大型 IR、二维产物及网格通过 Rust 为该任务分配的目录交换。路径和产物类型受协议约束；Python 不接受任意外部输出位置，不读取其他工程或覆盖其他任务产物。

- 文件读取、产物 JSON 包装和写入由 `runtime/artifacts` 的适配边界处理，消息信封由 `runner` 处理。建模模块返回内存几何数据，导出 feature 生成格式文本；文件写入不混进建模或格式编码函数。

- `runtime/artifacts.write_mesh(mesh, summary, artifact=None)` 只包装并原子写入任务产物；可选 `artifact` 是调用方生成的 `{format, content}`。格式选择在 `runner`，格式编码在相应导出 feature，现有 JSONL 与 `mesh.json` 协议保持不变。

## 验证

统一检查见 [语言说明](../../../agent-python.md#验证与维护)。验证固定目录输入、非法路径、输出失败、产物包装和原子写入。
