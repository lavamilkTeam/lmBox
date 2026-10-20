# 前端：逻辑电路草稿

先读 [模块说明](../../../agent-frontend-digital-logic.md)。`index.ts` 公开 `circuitComponents` 与 `useLogicCircuit`。`digital-logic-circuit` Pinia store 只保存当前会话节点、连线和标识序号，不依赖 UI、feature、引导状态或外部适配。

目录包含 AND、OR、NOT、NAND、NOR、XOR、XNOR、BUF。NOT/BUF 为单输入 A，其余为双输入 A/B；逻辑门单输出。HD44780 仅提供 RS、R/W、E、D0–D7 接线输入，`hasOutput` 为 false，不提供读取方向；电源、对比度与背光引脚不进入数字连线目录。节点 ID 与门类型分离，边保存来源节点、目标节点与目标输入名。没有计算状态或仿真结果。

逻辑门的 `description` 依据中文维基百科改写逻辑规则、表达式及电路用途，末句不带句号；`source` 保留各自条目的标签与链接。HD44780 文案依据控制器手册并注明当前编辑能力；随目录公开给调用方，不代表已执行逻辑求值或控制器指令。

所有编辑操作与连接规则归 [circuit-editing feature](../../features/circuit-editing/agent-frontend-circuit-editing.md)。草稿跨视图卸载保留，整页刷新重置；通过 feature 和浏览器公共行为验证，统一运行 `npm run check`。
