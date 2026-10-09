# Python：Python 协议映射

先读 [语言说明](../../../agent-python.md)；维护规则与隐私要求见根规范。

## 职责与边界

公开库无关 Mesh、参数及输入校验，与根 schema 对齐；定位源码/打包环境中的只读 schemas。

不依赖计算 feature/runtime/runner，不能另立通信字段或泄漏第三方库对象。未知版本、非法数值及单位明确拒绝。

## 行为约束

- `contracts` 校验共享 preview/graphics schema；`__main__` 只输出一条 JSONL 响应，失败诊断写 stderr。Rust 分配工作目录并管理进程。

## 验证

统一检查见 [语言说明](../../../agent-python.md#验证与维护)。验证三端共享 schema、合法/非法 fixtures 和源码/打包 schema 定位。
