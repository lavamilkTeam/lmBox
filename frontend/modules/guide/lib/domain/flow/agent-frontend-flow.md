# 前端：引导流程草稿

先读 [模块说明](../../../agent-frontend-guide.md)。`index.ts` 公开 `guideTools` 和 `useGuideFlow`。功能目录描述分类和工作区可用性；`guide-flow` Pinia store 保存会话内节点、位置及有向连接。

只允许已知功能与有限坐标；节点位置有正向边距。连接必须指向存在的不同节点，不允许重复或形成循环。删除节点同时删除入边与出边。此状态不是原生工程事实来源，不包含计算结果、数据映射或执行状态。

`tests/flow.test.ts` 通过公开入口验证连接规则、删除和位置校验；统一执行 `npm run check`。
