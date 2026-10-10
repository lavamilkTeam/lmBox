# 协议：CEA v1

先读 [协议说明](../../agent-contracts.md)。`cea-request.schema.json` / `cea-result.schema.json` 定义当前后端 Rust/CLI 请求与成功结果；尚无前端、Tauri IPC 或 Python 映射。

请求与结果携带 `schemaVersion=1`、`projectId`、`jobId`、`inputRevision`。反应物使用官方数据库物种名、质量分数和入口温度 K；质量分数必须合计为 1，不隐式归一化，不接受路径或自由格式 CEA 输入。用户可在调用端把配比换算为质量分数。

`calculation` 支持 `tp`（K、Pa）、`hp`（Pa，焓由各入口温度求得）、`rocket`（燃烧室 Pa、递增超声速面积比、equilibrium/frozenAtChamber/frozenAtThroat）。火箭为无限面积燃烧室模型；站点顺序为燃烧室、喉部、请求顺序的出口。

结果使用 K、Pa、kg/m³、J/kg、J/(kg·K)、kg/kmol；组分为质量分数数组，保留 CEA 对凝聚相的名称和排序。`cpJKgK` 是当前求解模式的定压比热，冻结流段采用冻结组分比热。`gammaS` 为等熵指数。

火箭性能包括 Ae/At、c*（m/s）、匹配出口压力时的推力系数/比冲及真空比冲（秒）。`matchedThrustCoefficient` 不含任意环境压力修正；不返回推力或几何尺寸。无限面积燃烧室 `performance=null`。成功结果 `converged=true`；错误和未收敛通过 Rust Result / CLI 非零退出返回，不伪造成功响应。

schema 检查结构与基本范围；质量分数和、唯一物种、递增面积比由业务验证。JSON 不接受 NaN/Infinity，Rust 直接调用也检查有限数。默认 Rust 协议测试校验共享样例与未知字段；真实 Fortran 测试另校验输出 schema、单位和官方参考结果。

样例源自 [NASA CEA v3.3.4 的 RP-1311 example 8](https://github.com/nasa/cea/blob/v3.3.4/test/main_interface/example8.inp)，数值参考 [官方输出](https://github.com/nasa/cea/blob/v3.3.4/test/main_interface/reference_output/example8.out)。
