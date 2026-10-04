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

<p align="center">让 Gerber 一键变成可 3D 打印的钢网模板。</p>

<p align="center">
  <a href="package.json"><img src="docs/badges/version.svg" alt="版本 0.1.0" height="28"></a>
  <a href="LICENSE"><img src="docs/badges/license.svg" alt="许可证：自定义，禁止商用" height="28"></a>
  <a href="https://lavamilk.club"><img src="docs/badges/website.svg" alt="官方网站：lavamilk.club" height="28"></a>
</p>

<p align="center"><sub>本项目使用自定义的源码可用许可证：禁止商用；对外发布或通过网络提供衍生作品时，须以相同许可证公开源码。<br>使用前请阅读 <a href="LICENSE">LICENSE</a>，了解条款，避免许可相关风险。许可证以中文文本为正式文本。</sub></p>

<p align="center"><img src="docs/images/stencil-3d.png" alt="lmBox 中的示例 3D 钢网模板" width="1000"></p>

<p align="center"><strong>3D 钢网模型 · STEP 导出规划中</strong><br><sub>图中为示例几何预览，目前尚未实现 STEP 文件生成。</sub></p>

<p align="center"><img src="docs/images/solder-paste-layer.png" alt="lmBox 中的示例顶层焊膏层及其开孔" width="1000"></p>

<p align="center"><strong>焊膏层预览</strong><br><sub>图中显示示例 Top Paste 层的开孔；导入 Gerber 文件后的真实图形解析仍在规划中。</sub></p>

<p align="center"><img src="docs/images/export-gerber.png" alt="PCB 编辑器中标出的 Gerber 导出选项" width="760"></p>

<p align="center"><strong>从 Gerber 开始</strong><br><sub>从 PCB 编辑器导出 Gerber 文件。我们的目标是：一键生成可 3D 打印的钢网文件，后续接入切片与 G-code 导出。</sub></p>

## 架构

采用按业务能力组织的模块化单体。Vue 前端已实现，Rust/Python 后端及切片器接入仍在规划中。

```text
Vue → Rust → Python 几何计算
           → 切片器 → G-code
```

| 模块 | 职责 | 文档 |
| --- | --- | --- |
| Vue | Feature-first 界面、文件状态、2D/3D/路径预览 | [前端架构](src/AGENTS.md) |
| Rust / Tauri | 导入、Gerber/DXF 解析、工程、任务、进程管理与导出 | [后端架构](src-tauri/AGENTS.md) |
| Python | 几何求值、轮廓运算、钢网建模与检查 | [计算引擎](engine/AGENTS.md) |
| 切片器 | 由 Rust 调用，执行切片并生成 G-code | [切片器接入](src-tauri/AGENTS.md#工程任务与产物) |
| contracts | 版本化数据、命令、事件与产物格式 | [跨语言协议](contracts/AGENTS.md) |

[项目工作规范](AGENTS.md)
