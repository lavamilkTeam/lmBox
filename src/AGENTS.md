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
- 当前 `browser.ts` 仅识别 ZIP 文件清单，没有保存原始输入。接入原生导入后，需要重新选择文件，不能假设旧标签里已有完整源数据。
- `ModelScene.vue` 中的挤出仅为明确标记的示例。真实链路加载 Python 生成的模型，不在 Three.js 里复制制造几何、开孔补偿或网格生成算法。
- 前端只渲染二维轮廓和模型；圆弧近似等制造精度由协议和 Python 决定，不随画布缩放改变。
- 浏览器开发适配与原生适配保持相同公开接口，不能在每个 feature 中散布环境判断。
- `platform/desktop` 的 `observeViewportSize` 公开入口封装浏览器尺寸观察并返回清理函数；预览 feature 拥有屏幕坐标换算和网格渲染。

## IR 预览接入

- `app` 从 `platform/desktop` 加载示例 IR，传给 domain；预览组件通过 `demo` 事件请求应用层打开示例，不自行加载或跨 feature 调用。
- `contracts/index.ts` 是前端协议的公开入口；协议层不得依赖业务模块。当前类型手工映射 graphics v2，Rust 测试校验示例 JSON 与解析输出一致；尚无三端自动类型生成。
- `preview/lib/render.ts` 只生成 SVG 显示指令；`IrLayer.vue` 用独立孔径遮罩与图层遮罩保留宏内曝光和图层绘制顺序。支持 flash、region、无孔圆孔径 stroke、全图重复及宏旋转；非圆或带孔孔径 stroke 明确报错，不能用近似线宽替代。
- 预览边界是包含孔径和完整圆弧的保守范围，用于适应画布，不是制造尺寸。图形含热焊盘不支持的间隙尺寸或超限重复时明确失败。
- 示例二维与三维共享 `demo.gbr` 解析数据；domain 只将固定示例的 dark 圆形/矩形 flash 映射为演示孔，不能扩展成生产几何算法。真实 IR 不使用示例三维或路径代替计算结果。
- SVG 私有计算的窄回归测试位于 `preview/lib/render.test.ts`，作为复杂内部算法测试的局部例外，不扩大 feature 公开接口。界面和遮罩合成通过浏览器行为验证。

## 界面约束

- 保持顶部导入和文件标签、左侧窄预览菜单、中央预览、右侧对应参数、底部日志的工作台布局。
- 预览保持纯黑背景；2D 与 G-code 使用低对比度主次网格，网格和刻度尺与模型同步缩放、平移；显示参数控制对应显示行为。
- 不重新加入开发状态文案、技术栈介绍、冗余说明块和装饰性状态灯。实际错误应简短、可操作。
- 示例用简短“示例”标识即可，不能在用户文件名下展示伪造模型。未实现的动作不能伪报成功。

## 验证

在仓库根目录运行 `npm run check`。测试公共行为：多标签隔离、文件导入、视图切换、参数更新、关闭确认、事件取消及错误处理。后续原生接口测试使用 platform 适配替身，不直接 mock feature 私有实现。
