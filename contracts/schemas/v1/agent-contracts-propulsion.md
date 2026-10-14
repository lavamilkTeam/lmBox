# 协议：喷管与喷注器初步计算 v1

先读 [协议说明](../../agent-contracts.md)。后端请求为 `propulsion-request.schema.json`，结果为 `propulsion-result.schema.json`；Rust 映射为 `contracts::propulsion`，前端手工映射位于 `frontend/contracts/propulsion.ts`，桌面命令为 `propulsion_run`；不包含 Python 映射。顶层由 `type: nozzle | injector` 分派，载荷分别为 `request` / `result`，未知字段和未支持模型明确拒绝。

`identity` 包含 schemaVersion=1、projectId、jobId、inputRevision，结果原样保留。ID 非空、无控制字符、最多 128 UTF-8 字节（schema 长度只作字符级预检，应用层执行字节/空白检查）。数值以 SI 表达；所有实际输入/输出必须有限，不以 null 伪装失败。数值语义和完整限制归 [Fortran 模块](../../../src-fortran/modules/propulsion/design/agent-fortran-propulsion.md)。schema 表达字段级约束，跨字段几何和模型范围由 Fortran 验证。

喷管请求带 CEA 组元质量分数/入口温度、化学模式、室压、总流量、环境压、面积比、每段分段数及型面参数。型面为 `conical` 或 `quadraticBell`，后者是指定角度的几何近似。每段分段数 4–2048；返回喉部圆弧与后段共 `2*segments+1` 个点，喉部 `(x=0,r=rt)`、出口 `x=divergentLengthM`，轴线为 x，长度为米。扩张段字段保留原有语义。

结果附 `cea` 同次理想性能结果、面积/半径、长度、理想推力/比冲/Cf、假设与过膨胀提示。`conicalDivergenceFactor` 钟形为 null，锥形仅供参考，不修正理想推力。结果 schema 的 CEA 引用 URI 是本地资源标识 `https://lmbox.invalid/schemas/v1/cea-result.schema.json`，验证器须注册仓库已有 CEA result schema，不尝试联网。

喷注器请求给总流量、O/F 质量比和两路液体参数（密度、动力黏度、压降、Cd、元件数、圆孔/环隙）。O/F 指氧化剂质量流量除以燃料质量流量，不是摩尔比。环隙输入为单个元件内径，返回单元外径、水力直径、单元/总面积、流量、截面平均速度和雷诺数。两路独立求尺寸，不宣称组装成同轴元件后满足壁厚和间隙要求。不把离心式/曲流异形孔当作已支持模型。

`modelVersion` 为 `nozzle-preliminary/1` 或 `injector-hydraulics/1`。不兼容接口需提升版本；数值假设和警告属于结果的一部分。运行 `cargo test --manifest-path src-rust/Cargo.toml --locked --test propulsion_contract` 和 `npm run check:propulsion`；前者不加载库，后者缺库必须失败。

可选 `chamber` 包含筒段内径、长度及 `filletedCone | tangentArcs | cubicBezier` 收敛参数；省略时与旧请求兼容。成功结果对应增加 `chamberGeometry`，上游轮廓从负轴向入口坐标延伸至 `(0,rt)`，最后一点与扩张段首点共享；合并显示时只保留一个喉点。上游最大 6146 点；所有尺寸 SI，角度为度。`firstPoint`/`secondPoint` 是圆弧连接点，三次曲线时是内部控制点；三次曲线的圆弧半径与连接角字段为 0。几何定义与约束以 Fortran 模块说明为准；不把有限几何解释为有限面积 CEA 求解。
