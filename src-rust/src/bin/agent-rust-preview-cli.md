# Rust：本地预览 CLI

先读 [语言说明](../../agent-rust.md)；维护规则与隐私要求见根规范。

独立 CEA CLI `bin/cea.rs` 的契约和验证见 [CEA 后端](../modules/propulsion/app/agent-rust-thermochemistry.md)。

## 职责与边界

`bin/preview.rs` 是本地开发的薄进程入口，转发请求至核心 app。

stdin/stdout 属适配边界，不复制参数验证；源环境和打包环境共用协议，进程执行由 runtime 管理。

## 行为约束

- CLI 首行读取 preview v1 请求，stdin 关闭即取消。Python 由 Rust 启动并在取消或 60 秒超时后终止、回收。临时任务目录只包含固定名称文件，完成/失败后清理。

## 验证

统一检查见 [语言说明](../../agent-rust.md#验证与维护)。验证一行 JSONL 请求/响应、stdin 关闭取消、失败输出与真实模型入口。

`bin/propulsion.rs` 的协议与调用方式见 [推进设计入口](../modules/propulsion/app/agent-rust-propulsion.md)。
