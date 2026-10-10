# CFD 原生控制器适配

`__init__.py` 仅公开 `run_worker`。`cfd_worker.py` 是 Rust 配置的独立 JSONL 进程入口；`application.py` 协调单个文档会话、有限操作、动作排队与状态快照；私有 `runtime/` 拥有 FreeCAD/CfdOF、Qt 控件、原生文档、文件验证及 Docker 适配。模块不导入钢网实现，不重新实现 CFD 物理、网格或求解器。

Rust 拥有工程与输入版本、可信运行时配置、文件暂存、进程和会话目录。Python 只接受有限操作和 JSON 值，源目录、解释器、Docker 镜像及可执行程序由启动参数提供。每个会话使用独立配置及可写上游源码副本；开发命令仅作用于该副本。FreeCAD 全部操作在 Qt 主线程执行，stdin 读取线程只排队。标准输出仅传输 JSONL，原生输出转到 stderr。

可能进入原生模态窗口的动作先返回 `busy` 与 `pendingAction`，下一 Qt 事件执行。`poll` 和 `dialogResponse` 在模态窗口事件循环中继续处理；完成状态通过 `lastAction` 返回。控件 ID 只引用已投影的原生控件，属性只允许快照中公开的原生类型。路径配置不接受前端任意字符串；CAD 导入限 Rust 暂存目录，导出固定为会话目录中的 `session.FCStd`。FCStd 恢复前检查压缩大小、XML 及已加载 CfdOF 的 JSON 代理，拒绝任意 Python pickle。

几何快照有对象、三角面、Face/Edge/Vertex/Solid 标识；原生 Mesh 与 FEM 表面网格投影有界拓扑，只支持对象选择，不伪造 CAD 子元素标识。选择可追加到原生选择集；Global 链接属性仍只引用当前会话文档，并使用相同可逆链接值。控件保留原布局、动态显示、单位和原生信号；图表读取原求解器绘图数据。快照设置对象、控件、几何和数据点上限，不能将截断结果当成完整模型。工作台命令可用性由上游 `IsActive` 决定，依赖或求解失败必须返回真实错误。

验证运行 `npm run check:geometry`。原生能力另用可信 FreeCAD Python 从 `-m lmbox_geometry.cfd_worker` 公开入口执行 JSONL 测试；测试必须使用临时配置/源码/文档并明确关闭进程。需要原生 GUI 框架的测试不能用普通 CPython 或模拟成功替代。OpenFOAM/cfMesh/HiSA/ParaView 版本与安装归宿主配置，不从 Python 包依赖推断可用。
