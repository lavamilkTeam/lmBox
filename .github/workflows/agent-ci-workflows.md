# CI：检查与发布工作流

先读 [CI 说明](../agent-ci.md) 和受影响语言说明；工作流改动应用 `$code-boundary-standards`。

`ci.yml` 运行前端、Rust、Python、桌面矩阵和工作流检查，`Quality gate` 仅全部成功才放行；失败、取消或跳过不能通过。`release.yml` 使用完整门禁后校验并发布安装器。执行与发布细节见 [质量规范](../QUALITY.md)。

不得通过 path filter、跳过测试、弱化边界或忽略错误获得绿色状态。Actions、工具链和依赖版本按现有约定固定；凭证不进入构建/测试。远端 required checks 需核对实际绑定，配置文件不能证明设置生效。运行 actionlint 与受影响的本地检查；三平台与 Release 以实际 hosted run 为准。
