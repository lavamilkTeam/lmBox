# 安装页面构建

先读[构建工具说明](agent-javascript.md)。根 `vite.installer.config.ts` 负责独立 Web 欢迎页预览；`installer.mjs` 负责 Qt 原生安装器构建与部署，通过[原生模块管理](../desktop/modules/agent-rust.md)接入下载与安装；构建脚本不实现安装业务。

- `npm run dev:installer` 在 `127.0.0.1:6523/installer.html` 提供安装预览；固定端口，冲突时失败。与软件前端 `6522` 分开运行。
- `npm run build:installer` 进行前端类型检查并构建 `installer.html`，输出到忽略提交的 `dist-installer/`；包含安装 UI、共享 shadcn-vue 主题与控件、Vue 及本地素材；Tailwind 与工作台使用同一 Vite 插件。
- 使用独立 Vite 缓存 `node_modules/.vite-installer`，避免与工作台开发服务竞争依赖预构建缓存。
- Web 入口仅用于预览；原生入口见 [Qt 安装器](../desktop/installer/agent-cpp.md)。Web 入口仍只预览欢迎页；Qt 原生入口已接入签名模块目录及按需 ZIP 安装。

`installer.mjs` 先执行 `modules:prepare`，将包含发布公钥/地址的管理程序编译并部署到安装器可执行目录。可通过原生程序 `--catalog URL` 指定同一公钥签名的本地测试清单。

Qt 使用已安装的 CMake、C++ 工具链和 Qt 6.8+ Quick/QuickControls2。脚本从 `QTDIR` 或 `qmake -query QT_INSTALL_PREFIX` 定位 Qt，支持 `QMAKE` 与 `CMAKE` 覆盖，不硬编码本机路径。

- `npm run installer:build` 编译到 `.tools/installer-qt`。
- `npm run installer:dev` 构建并运行原生窗口；附加 `-- --reduce-motion` 可关闭动画。
- `npm run installer:package` 将应用及 Qt 运行依赖部署到 `dist-installer-qt`。macOS 输出 `lmbox-installer.app`，不依赖 Web 服务或系统安装 Qt；Windows/Linux 需要在对应系统构建与验证。
- Qt 打包不代表开发者签名、公证或正式发布完成。

验证执行 `npm run check`、`npm run build:installer`、`npm run installer:package` 和 QML 静态检查，并实际打开产物检查首次动画与字体加载。
