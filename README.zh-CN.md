<h1 align="center">
  <img src="docs/images/lmbox-logo-pig.png" alt="" width="72" height="72" align="absmiddle">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/lmbox-wordmark-dark.svg">
    <img src="docs/images/lmbox-wordmark.svg" alt="lmBox" width="190" height="80" align="absmiddle">
  </picture>
</h1>

<p align="center">
  <a href="README.md">English</a> · <a href="README.ko.md">한국어</a> · <strong>中文</strong>
</p>

<p align="center">面向电子元器件、流体等领域的工业设计与仿真平台，未来将提供光学功能。</p>

<p align="center">
  <a href="package.json"><img src="docs/badges/version.svg" alt="版本 0.1.0" height="28"></a>
  <a href="LICENSE"><img src="docs/badges/license.svg" alt="许可证：自定义，禁止商用" height="28"></a>
  <a href="https://lavamilk.club"><img src="docs/badges/website.svg" alt="官方网站：lavamilk.club" height="28"></a>
</p>

<p align="center"><sub>本项目使用自定义的源码可用许可证：禁止商用；对外发布或通过网络提供衍生作品时，须以相同许可证公开源码。<br>使用前请阅读 <a href="LICENSE">LICENSE</a>，了解条款，避免许可相关风险。许可证以中文文本为正式文本。</sub></p>

<p align="center"><img src="docs/images/workflow.png" alt="lmBox 功能库与流程画布" width="1000"></p>

<p align="center"><strong>工业设计工作区</strong><br><sub>从功能库选择工具，在流程画布中组织工作区。</sub></p>

<p align="center"><img src="docs/images/cfd-flow.jpg" alt="lmBox 中 737 CFD 算例的压力、网格与流线" width="1000"></p>

<p align="center"><strong>CFD 仿真结果</strong><br><sub>显示实际计算的 737 算例压力云图、表面网格、流线与求解进度。</sub></p>

<p align="center"><img src="docs/images/stencil-3d.png" alt="lmBox 中的示例 3D 钢网模板" width="1000"></p>

<p align="center"><strong>3D 钢网模型 · STEP 导出规划中</strong><br><sub>从 Gerber 生成钢网模型，可设置厚度、边距与开孔补偿。图中为示例板；STEP 导出、切片与 G-code 输出仍在规划中。</sub></p>

## 架构

采用按业务能力组织的模块化单体。Vue 提供工作区，Rust 协调导入、版本化任务与原生进程，Python 和 Fortran 提供几何与数值计算能力。真实切片器尚未接入。

```text
Vue → 桌面/开发适配 → Rust → Python 几何计算 / CFD 适配
                         → Fortran 数值计算
```

| 模块 | 职责 | 文档 |
| --- | --- | --- |
| Vue | Feature-first 工作区、文件状态与 2D/3D 可视化 | [前端架构](frontend/agent-frontend.md) |
| Rust / Tauri | 导入、解析、版本化任务、原生进程管理与导出 | [业务核心](src-rust/agent-rust.md)、[桌面宿主](desktop/tauri/agent-rust.md) |
| Python | 几何求值、钢网建模与检查、FreeCAD/CfdOF 接入；OpenFOAM/HiSA 求解与 ParaView/VTK 结果读取 | [计算引擎](engine/agent-python.md) |
| Fortran | CEA 热化学、喷管与喷注器计算 | [数值后端](src-fortran/agent-fortran.md) |
| 切片器（规划中） | 切片并生成 G-code | [切片设置](frontend/modules/stencil/lib/features/slicing/agent-frontend-slicing.md) |
| contracts | 版本化数据、命令、事件与产物格式 | [跨语言协议](contracts/AGENTS.md) |

[项目工作规范](AGENTS.md)
