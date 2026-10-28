# 云网页构建与打包

先读[构建工具说明](../agent-javascript.md)。`build.mjs` 通过既有前端构建命令复用 WASM、类型检查、Vite 配置和许可证收集，不依赖桌面打包入口或复制业务实现。

- `npm run cloud:build`：构建完整网页资源到 `dist-cloud/site/`，不覆盖桌面使用的 `dist/`。
- `npm run cloud:package`：重新构建网页并输出 `dist-cloud/lmbox-web-<版本>.tar.gz`；解压根目录直接包含 `index.html`、assets 和许可证，包括项目 LICENSE 与前端第三方声明；不携带 macOS 扩展属性旁文件。失败时不保留本次版本的旧归档或不完整归档。

网页包只包含静态前端与浏览器 WASM，不包含 Tauri 原生宿主、服务器程序、原生求解器、运行配置或凭据。网页通过同源 `/api/*` 访问计算服务；部署时须由服务器提供这些接口。现有开发插件不能充当已实现的生产云服务，静态包构建成功不代表云仿真已经可用。

验证执行 `npm run check`、`npm run cloud:package`，解压归档核对入口、WASM、许可证和资源完整性，并通过静态 HTTP 服务打开网页。
