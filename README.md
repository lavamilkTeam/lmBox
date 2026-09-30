# Stencil Studio

Repository: [lavamilkTeam/lmBox](https://github.com/lavamilkTeam/lmBox).

## 许可证

项目自有代码采用 [lmBox 非商业使用与衍生源码公开许可证 v1.0](LICENSE)。

- **禁止商用**，包括收费分发、商业服务、企业经营用途及使用本软件生产销售产品。
- **原作者本人也不例外**：许可证包含原作者及贡献者的同等非商业承诺，不保留商业双重授权通道。权利人承诺的具体法律效力依适用法律确定。
- **衍生作品须公开完整对应源码**：对外交付或通过网络提供功能时，须以同一许可证免费公开对应源码，保留许可与修改说明。仅本人私下使用的非商业修改无需发布。
- 第三方依赖保持各自许可证；用户设计文件与普通生成结果无需因此公开。

这是限制商用的**源码可用许可证**，不属于 OSI 定义的开源许可证。完整条款以 LICENSE 为准。

Vue 3 desktop-workbench frontend for a Gerber-to-stencil application. Current delivery is the frontend, runnable in a browser for development. Rust/Tauri and Python runtime integration are not yet implemented.

## Run

```sh
npm install
npm run dev
```

Open http://127.0.0.1:1420. Build with `npm run build`; verify with `npm run check`.

## Implemented

- Browser-style independent document tabs, close confirmation for changed parameters.
- Multi-file selection and drag/drop; ZIP directory inventory with size/count limits.
- Explicit example geometry, 2D zoom/pan, Three.js 3D rotation and actual example mesh thickness/hole compensation.
- Contextual 2D/3D/G-code parameter panels, example toolpath layer display.
- Per-document logs, severity filter, clear/collapse, parameter JSON export.
- Cmd/Ctrl+O import and Cmd/Ctrl+S parameter export.

Actual imported files show their file inventory without a rendered model. They do not receive fabricated geometry. G-code export remains disabled until a real slicer is connected. Example geometry is not ceshi.zip. The browser adapter inventories files only and does not retain source payloads; reopening/reselecting will be necessary when adding the native import flow. Tabs and parameters are in memory; JSON parameter export is not a full project save.

## Boundaries

`app` orchestrates features. `features/{project,import-board,stencil,preview,slicing,logs}` own their UI. Feature internals stay in `lib/`; consumers import root `index.ts` only. Features never import one another. `domain/project` owns documents and parameter state. `platform/desktop` owns I/O, presently via an explicit browser development adapter. `ui` is reserved for reusable non-domain UI if needed.

`npm run lint:boundaries` enforces private-entry-point restrictions, independent features, domain/platform direction and no cycles, including Vue SFC imports. Domain tests exercise the public entry point.

Future native flow: Vue → Rust commands → Python geometry or slicer. Rust owns ZIP handling, files, project persistence, process lifecycle, task cancellation and export. Python owns Gerber/DXF interpretation, geometry and mesh generation. Do not move manufacturing geometry into Vue.
