# Python：计算引擎打包

先读 [语言说明](agent-python.md)；维护规则与隐私要求见根规范。

## 职责与边界

维护固定版本 bundle 依赖及同一计算入口的可搬移资源。

打包构建适配由 [构建脚本说明](../scripts/agent-javascript-build.md) 管；feature 不感知打包方式，不新增另一套算法、入口或协议。

## 行为约束

- `scripts/build-worker.mjs` 使用固定版本的 PyInstaller 目录模式打包现有 `__main__` 入口，包含原生几何依赖和共享 schemas；不新增另一套几何入口或协议。
- contracts 只根据普通 Python/打包运行环境定位只读 schema，计算 feature 不知道打包方式。打包产物位于忽略提交的 `desktop/tauri/resources/`。
- `npm run check:worker` 将完整引擎复制到临时目录，在清空 Python 路径后验证请求关联、两孔模型和真实 STL。三平台 CI 均必须运行；它不替代完整几何回归测试。
- Python CI 拒绝 Ruff 和 import-linter 错误，并运行所有 pytest；打包依赖列在 `pyproject.toml` 的 bundle extra。

## 验证

统一检查见 [语言说明](agent-python.md#验证与维护)。运行 build:worker/check:worker；搬移完整引擎后清空 Python 路径，验证真实协议、模型和 STL。
