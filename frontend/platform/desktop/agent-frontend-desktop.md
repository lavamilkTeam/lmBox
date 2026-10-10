# 前端：浏览器与桌面适配

先读 [语言说明](../../agent-frontend.md)；维护规则与隐私要求见根规范。

## 职责与边界

通过 `index.ts` 暴露受控导入、计算、保存、示例加载和尺寸观察；浏览器与原生适配共用接口。

文件、Worker、网络、进程接入和 Tauri API 在此适配，业务失效策略归 feature/应用层；不得反向导入它们或 UI。只使用共享协议类型，不依赖领域模块、domain 或 store。

## 行为约束

- 组件可捕获用户点击、拖放等 DOM 事件，但文件选择 API、文件读取、写盘、Tauri 命令与任务事件订阅必须封装在 `platform/desktop`。

- `browser.ts` 负责读取用户选中的文件字节，通过每次导入独占的 Worker 调用 Rust/WASM；ZIP 解包、图层识别和 Gerber 解析均在 Rust。当前只保留会话内的解析快照，没有工程持久化；接入原生工程保存时仍需重新选择源文件。

- 浏览器开发适配与原生适配保持相同公开接口，不能在每个 feature 中散布环境判断。

- `platform/desktop` 的 `observeViewportSize` 公开入口封装浏览器尺寸观察并返回清理函数；预览 feature 拥有屏幕坐标换算和网格渲染。

- 导入最多 500 个文件、单文件 30 MB、选择总大小 150 MB；Worker 请求携带关联 ID，单文件解析限时 30 秒，取消/超时/完成均终止本次 Worker 并释放临时内存。

- WASM 绑定及二进制位于 `frontend/platform/desktop/lib/generated/`，由 `npm run build:wasm` 生成并忽略提交。该目录是工具生成代码的局部边界例外，不手改。`scripts/build-wasm.mjs` 仅负责构建。

- 首次配置运行 `npm run setup:wasm`；`dev`、`build`、`check` 的前置脚本自动构建 WASM。绑定工具版本与 Cargo 依赖固定一致，生成产物随 Vite 打包，可在静态部署中运行，无解析服务器。

- 本地 `dev` 和 `vite preview` 通过 `scripts/preview-api.ts` 的受限适配调用 Rust CLI。静态文件独立部署不包含计算服务，返回明确错误。首次执行 `npm run setup:geometry`；启动前构建原生预览入口。

- 本地计算服务最多两个并行任务；浏览器集成测试使用两个 worker，覆盖框选、编辑历史、局部优化、导出及定位底板。

- `frontend/platform/desktop/lib/native.ts` 私有封装 Tauri 检测、模型 IPC 和原生保存；feature 和 domain 不检测宿主、不导入 Tauri。dependency-cruiser 自动限制 `@tauri-apps/*` 只能出现在该平台模块。

- 原生模型请求分为登记、运行和取消；适配在登记完成后补发准备期间的取消，运行响应仍接受相同身份及网格校验。浏览器继续使用 WASM 导入，桌面也复用该 Rust 解析器，不复制解析逻辑。

- `saveTextFile`、`saveModelArtifact` 返回 `Promise<boolean>`，false 表示用户取消保存；调用者等待结果后才提示成功，异常显示失败。文本适配接收文件名、内容和 MIME，不组装钢网参数 JSON；数据格式由领域 feature 决定。

## 验证

统一检查见 [语言说明](../../agent-frontend.md#验证与维护)。验证资源限制、Worker 超时与取消、IPC 准备期取消、保存取消和真实计算接入。
