# 前端：喷注器参数与结果

先读 [模块说明](../../../agent-frontend-propulsion.md)。`index.ts` 公开 `InjectorDesign`。独立呈现两路液体、圆孔/环隙及水力结果，通过 domain 编辑输入，以事件请求应用层计算；不依赖喷管 feature。

单位与字段对应 [propulsion v1](../../../../../../contracts/schemas/v1/agent-contracts-propulsion.md)。初始两路均为明确标注的水物性示例。截面直接使用返回内外径，分别缩放，不表示同轴装配或喷注面排布。没有原生结果时不生成示例尺寸。前端不计算流量分配、孔径或雷诺数。

执行 `npm run check`，验证真实圆孔/环隙计算、单位显示、切换保留、响应失效与错误。
