# 前端架构与注意事项

先读 [根 AGENTS.md](../AGENTS.md)，并应用 `$code-boundary-standards`。桌面接口相关改动还需读 [Rust 说明](../src-tauri/AGENTS.md) 和 [协议说明](../contracts/AGENTS.md)。

## 架构：Feature-first

Vue 3 + TypeScript + Pinia + Naive UI，Three.js 负责显示。以业务功能聚合组件、交互逻辑和测试，不将所有组件、store 和 hooks 按技术类型平铺到全局目录。

```text
src/
├── main.ts                       # 启动、注册框架依赖
├── app/
│   ├── App.vue                   # 工作台组装、跨 feature 交互协调
│   ├── styles.css                # 全局样式、设计基础
│   └── lib/                      # 流程复杂后按需提取私有协调逻辑
├── features/
│   ├── project/                  # 文件标签、打开/关闭工程
│   ├── import-board/             # 导入操作的界面入口
│   ├── stencil/                  # 图层与模板参数面板
│   ├── preview/                  # 2D、3D、G-code 路径显示
│   ├── slicing/                  # 切片参数与操作
│   └── logs/                     # 日志显示、过滤、折叠
├── domain/project/               # 工程快照、参数与前端状态
├── platform/desktop/             # 桌面调用及浏览器开发适配
├── contracts/                    # graphics v2 协议类型的公开入口
└── ui/                           # 按需增加通用、无业务语义的组件
```

`app/lib/` 等按实际需要建立。各 feature 的基本形态如下，不强制创建没有用途的文件：

```text
features/stencil/
├── index.ts                      # 稳定公开入口
├── lib/                          # 私有组件、composable、校验等
└── tests/                        # 通过公开接口测试
```

## 依赖边界

- `app → features / domain / platform / ui`。
- `features → domain / platform / ui / contracts`；feature 之间不直接依赖，由 app 传值、监听事件并协调。
- `domain → contracts` 和必要的状态库；不能依赖 app、feature、platform、UI 或 Tauri。
- `platform → contracts`；迁移期允许依赖 domain 的公开类型，不得访问其 store 或私有实现。
- `ui` 仅依赖框架、样式和通用 UI 库，不知道 Gerber、工程和切片。
- `contracts` 是底层数据约定，不依赖上述业务层。新增代码时补齐对应边界检查。

跨模块必须从 `index.ts` 或其他明确的根级公开入口导入，禁止跨入 `lib/`、`tests/`。不要为测试而导出内部函数。现有 `.dependency-cruiser.cjs` 必须继续生效；接入 Tauri 时补充“只有 platform 能导入 `@tauri-apps/*`”的自动约束，不削弱已有规则。

## 状态与数据

- 原生接入后，Rust 持有工程真实状态，Pinia 保存界面需要的工程快照、编辑草稿和选中状态。业务校验以 Rust 返回结果为准。
- 逐步将当前混合的 `Parameters` 拆为 `viewState`、`modelSettings`、`sliceSettings`。缩放、视角、网格、透明度不触发模型计算。
- 每个文件标签保存独立的视图和参数；切换标签不能覆盖其他工程的状态。
- 大网格、Three.js 对象、完整 G-code 不放入深层响应式 store。保存产物引用；预览模块负责加载、释放 GPU 和事件资源。
- 计算响应按 `projectId + jobId + inputRevision` 匹配。过期响应丢弃；修改模型参数后，旧模型不能冒充当前模型继续切片。
- 源文件与工程完整保存交给 Rust。当前参数 JSON 导出不等于工程保存。

## 外部交互与真实模型迁移

- 组件可捕获用户点击、拖放等 DOM 事件，但文件选择 API、文件读取、写盘、Tauri 命令与任务事件订阅必须封装在 `platform/desktop`。
- `browser.ts` 负责读取用户选中的文件字节，通过每次导入独占的 Worker 调用 Rust/WASM；ZIP 解包、图层识别和 Gerber 解析均在 Rust。当前只保留会话内的解析快照，没有工程持久化；接入原生工程保存时仍需重新选择源文件。
- `ModelScene.vue` 中的挤出仅为明确标记的示例。真实链路加载 Python 生成的预览网格，不在 Three.js 里复制制造几何、开孔补偿或网格生成算法。
- 前端只渲染二维轮廓和模型；圆弧近似等制造精度由协议和 Python 决定，不随画布缩放改变。
- 浏览器开发适配与原生适配保持相同公开接口，不能在每个 feature 中散布环境判断。
- `platform/desktop` 的 `observeViewportSize` 公开入口封装浏览器尺寸观察并返回清理函数；预览 feature 拥有屏幕坐标换算和网格渲染。

## IR 预览接入

- `app` 从 `platform/desktop` 加载示例 IR，传给 domain；预览组件通过 `demo` 事件请求应用层打开示例，不自行加载或跨 feature 调用。
- `contracts/index.ts` 是前端协议的公开入口；协议层不得依赖业务模块。当前类型手工映射 graphics v2，Rust 测试校验示例 JSON 与解析输出一致；尚无三端自动类型生成。
- `preview/lib/render.ts` 只生成 SVG 显示指令；`IrLayer.vue` 对普通 dark 图元直接绘制，仅为带局部 clear 的宏和含图层 clear 的合成建立必要遮罩，保留曝光和绘制顺序。支持 flash、region、无孔圆孔径 stroke、全图重复及宏旋转；非圆或带孔孔径 stroke 明确报错，不能用近似线宽替代。
- 预览边界是包含孔径和完整圆弧的保守范围，用于适应画布，不是制造尺寸。图形含热焊盘不支持的间隙尺寸或超限重复时明确失败。
- 示例二维与三维共享 `demo.gbr` 解析数据；domain 只将固定示例的 dark 圆形/矩形 flash 映射为演示孔，不能扩展成生产几何算法。真实 IR 不使用示例三维或路径代替计算结果。
- SVG 私有计算的窄回归测试位于 `preview/lib/render.test.ts`，作为复杂内部算法测试的局部例外，不扩大 feature 公开接口。界面和遮罩合成通过浏览器行为验证。

## 真实文件显示

- 导入协议类型来自 `contracts/index.ts`。每个 `LayerFile` 保存对应 IR 或定位诊断，domain 的 `activeLayer`、`activeIr`、`selectLayer` 管理选择；预览模块不重新解释文件格式。
- 首次导入优先显示可解析的锡膏层，也允许选择板框、铜层和失败图层查看诊断。板框以独立颜色叠加；显示范围用于画布适应，不冒充真实板框尺寸。
- 每个文档保存二维 zoom/pan；切换文档恢复视图，切换图层重置以适应新图形。可解析的真实图层开放三维预览；路径入口仍禁用，不展示示例产物。
- 导入最多 500 个文件、单文件 30 MB、选择总大小 150 MB；Worker 请求携带关联 ID，单文件解析限时 30 秒，取消/超时/完成均终止本次 Worker 并释放临时内存。
- WASM 绑定及二进制位于 `platform/desktop/lib/generated/`，由 `npm run build:wasm` 生成并忽略提交。该目录是工具生成代码的局部边界例外，不手改。`scripts/build-wasm.mjs` 仅负责构建。
- 首次配置运行 `npm run setup:wasm`；`dev`、`build`、`check` 的前置脚本自动构建 WASM。绑定工具版本与 Cargo 依赖固定一致，生成产物随 Vite 打包，可在静态部署中运行，无解析服务器。

## 界面约束

- 保持顶部导入和文件标签、左侧窄预览菜单、中央预览、右侧对应参数、底部日志的工作台布局。
- 预览保持纯黑背景；2D 与 G-code 使用低对比度主次网格，网格和刻度尺与模型同步缩放、平移；显示参数控制对应显示行为。
- 不重新加入开发状态文案、技术栈介绍、冗余说明块和装饰性状态灯。实际错误应简短、可操作。
- 示例用简短“示例”标识即可，不能在用户文件名下展示伪造模型。未实现的动作不能伪报成功。

## 验证

在仓库根目录运行 `npm run check`。测试公共行为：多标签隔离、文件导入、视图切换、参数更新、关闭确认、事件取消及错误处理。后续原生接口测试使用 platform 适配替身，不直接 mock feature 私有实现。

## 真实三维预览

- `app/lib/useModelPreview` 协调模型任务；`platform/desktop::generatePreview` 是唯一浏览器请求入口，向同源 `/api/preview` 发送版本化请求。
- domain 保存任务状态、修订号及 `markRaw` 网格；只有匹配工程、任务、修订号的运行中请求可发布结果。显示设置不使模型失效；图层、厚度、边距、补偿及镜像变化清除旧模型。
- `ModelScene` 直接加载 Python 输出的顶点和三角索引，设置相机、材质和交互，不生成真实制造几何。固定示例仍保留演示路径。
- 模板支持矩形及闭合单板随形外框；未选择板框时使用图形范围矩形，并在右侧说明这一尺寸来源。
- 本地 `dev` 和 `vite preview` 通过 `scripts/preview-api.ts` 的受限适配调用 Rust CLI。静态文件独立部署不包含计算服务，返回明确错误。首次执行 `npm run setup:geometry`；启动前构建原生预览入口。


## 图形编辑与模型导出

- 右侧 `stencil` feature 包含开孔编辑、外框/底板、打印优化三个分类；固定演示仍保留独立示例参数，不冒充真实计算。数值字段组件是 feature 私有实现。
- 左侧 `preview` feature 管二维单选、相交框选、Shift 追加、选中高亮和屏幕坐标换算。中键或平移工具拖动画布；三维继续使用轨道控制，通过选择工具返回二维编辑。SVG 原始操作仅作显示，计算完成后显示 Python 返回的对象轮廓和材料轮廓。
- domain 保存每层稀疏编辑、选中集合、建模设置及最多 50 步撤销/重做；原始 IR 不变。实例 ID 为 `重复行:重复列:对象索引`（零基）。编辑、优化、板框选择均使模型版本失效；选中状态、显示已删除、视图变换不触发计算。
- `useModelPreview` 在真实图层的二维/三维视图协调同一模型任务。过期网格立即清除，计算中显示原图和提示；只有当前成功结果可导出。每层局部优化覆盖整层默认优化；所有制造运算仍归 Python。
- `app/lib/useModelExport` 用独立任务身份重新计算并核对当前修订；改变文档/参数或卸载即取消。`platform/desktop` 校验结果并下载本地服务返回的 STL、SVG、DXF。SVG/DXF 为钢网接触面的二维轮廓，底板则为带卸板槽及斜口的顶缘截面；STL 包含完整孔壁/高度。
- 参数 JSON v2 额外保存图层选择、建模设置及编辑覆盖，不包含源文件，也不是完整工程存储。预览算法版本随结果记录。
- 本地计算服务最多两个并行任务；浏览器集成测试使用两个 worker，覆盖框选、编辑历史、局部优化、导出及定位底板。

- 二维喇叭口上轮廓从已完成原生网格的顶面边界提取，仅用于叠加显示；不按界面参数重算制造轮廓。`preview/lib/mesh-outline.test.ts` 是该私有显示算法的窄测试例外。橙色虚线表示上口，填充图形表示贴板下口，叠加不参与选择命中。
- 改变选中集合后，打印优化默认切换到当前选中；仍可显式选择整层。优化草稿只随文档、图层、选中集合、范围或实际优化配置变化同步，补偿等其他模型参数变化不得丢弃尚未应用的优化草稿。
