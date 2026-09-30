<h1 align="center">
  <img src="docs/images/lmbox-logo.png" alt="" width="72" height="72" align="absmiddle">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/lmbox-wordmark-dark.svg">
    <img src="docs/images/lmbox-wordmark.svg" alt="lmBox" width="190" height="80" align="absmiddle">
  </picture>
</h1>

<p align="center">
  <strong>English</strong> · <a href="README.ko.md">한국어</a> · <a href="README.zh-CN.md">中文</a>
</p>

<p align="center">Building a one-click path from Gerber to 3D-printable solder paste stencils.</p>

<p align="center">
  <a href="package.json"><img src="docs/badges/version.svg" alt="Version 0.1.0" height="28"></a>
  <a href="LICENSE"><img src="docs/badges/license.svg" alt="License: custom, noncommercial" height="28"></a>
  <a href="https://lavamilk.club"><img src="docs/badges/website.svg" alt="Official website: lavamilk.club" height="28"></a>
</p>

<p align="center"><sub>Custom source-available license: commercial use is prohibited; derivatives distributed or provided over a network must publish their source under the same license.<br>Read <a href="LICENSE">LICENSE</a> before use to understand the terms and avoid licensing risks. The Chinese license text is authoritative.</sub></p>

<p align="center"><img src="docs/images/stencil-3d.png" alt="lmBox showing a sample 3D solder paste stencil" width="1000"></p>

<p align="center"><strong>3D stencil model · STEP export planned</strong><br><sub>Sample geometry preview. STEP file generation is not available yet.</sub></p>

<p align="center"><img src="docs/images/solder-paste-layer.png" alt="lmBox showing the sample Top Paste layer and its apertures" width="1000"></p>

<p align="center"><strong>Solder paste layer preview</strong><br><sub>Apertures from the sample Top Paste layer. Geometry parsing for imported Gerber files is planned.</sub></p>

<p align="center"><img src="docs/images/export-gerber.png" alt="PCB editor menu with the Gerber export option highlighted" width="760"></p>

<p align="center"><strong>Start with Gerber</strong><br><sub>Export Gerber files from your PCB editor. Our goal: generate 3D-printable stencil files in one click, with slicing and G-code export to follow.</sub></p>

## Architecture

A modular monolith organized by capability. The Vue frontend is implemented; the Rust/Python backend and slicer integration are planned.

```text
Vue → Rust → Python geometry
           → Slicer → G-code
```

| Component | Responsibility | Documentation |
| --- | --- | --- |
| Vue | Feature-first UI, document state, 2D/3D/toolpath previews | [Frontend](src/AGENTS.md) |
| Rust / Tauri | Import, Gerber/DXF parsing, projects, jobs, process management and export | [Backend](src-tauri/AGENTS.md) |
| Python | Geometry evaluation, contour operations, stencil models and validation | [Geometry engine](engine/AGENTS.md) |
| Slicer | Slicing and G-code generation, invoked by Rust | [Slicer integration](src-tauri/AGENTS.md#工程任务与产物) |
| contracts | Versioned data, commands, events and artifact formats | [Cross-language contracts](contracts/AGENTS.md) |

[Project guidelines](AGENTS.md)
