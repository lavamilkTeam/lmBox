# 前端：喷管参数与结果

先读 [模块说明](../../../agent-frontend-propulsion.md)。`index.ts` 公开 `NozzleDesign`；内部访问 design domain，计算由 `calculate` 事件交给应用层，不调用另一 feature。

输入映射 [propulsion v1](../../../../../../contracts/schemas/v1/agent-contracts-propulsion.md)：组元、工况、冻结模式、锥形或二次曲线钟形及离散数；可选筒段与三类收敛段使用同一喉部基准。原生结果提供理想性能、尺寸、热力状态和上下游坐标；仅转换展示单位，不在前端推导型面。示例和模型范围可辨识，过膨胀提示保留。以 props 中有效结果控制显示；没有结果时不绘制伪造几何。

样式与 SVG 在模块 UI；执行 `npm run check`，真实 CEA/Fortran 链路验证锥形、钟形、错误恢复、修改失效和导出。

将同次结果的上下游点列合并传给 UI 生成 2D 图；标注使用已提交请求和结果，禁止混用失效草稿。SVG/DXF 通过 `exportDrawing` 事件交给 app 保存。结构条件文字独立于数值输入，空项在图纸中隐藏；它们不生成外壁、冷却或连接结构。
