# 前端：CFD 控件与视图

先读 [模块说明](../../agent-frontend-cfd.md)。纯 props/events 组件呈现 worker 的布局、控件、几何与曲线，不访问 contracts、platform 或 domain。标准控件使用共享 shadcn，布局 CSS 限定在 `.cfd-workspace`。

中文目录来自 CfdOF 源码固定版本 `a90f60c2313ceba09c236c81f0693d93357d1614` 的翻译模板、表单、属性与原有繁体中文翻译；原生标识与用户文件名不翻译。视口尺寸和像素比例由应用层传入；几何只渲染原生三角网格，通过稳定对象和面标识回传选择；曲线只显示 worker 的真实数据。
