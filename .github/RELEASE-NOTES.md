Installers / 安装包：

- Windows x64: `-setup.exe`.
- macOS Apple Silicon (arm64): `.dmg`.
- Linux x64 (Ubuntu 24.04 or compatible): `.deb` or `.AppImage`.

The geometry engine is included; Python and Node.js are not required to run the installed app.
安装包包含计算引擎，运行已安装的软件无需另装 Python 或 Node.js。

These builds are not signed with Windows publisher or Apple Developer certificates and are not notarized by Apple. OS security prompts may appear. Installer generation and worker validation do not represent automated GUI verification on all platforms.
这些构建尚未使用 Windows 发布者或 Apple 开发者证书签名，也未通过 Apple 公证，系统可能显示安全提示。安装包生成及引擎验证不代表已完成三平台 GUI 自动化验证。

`SHA256SUMS` contains installer checksums; `release-manifest.json` identifies the source commit and platforms. In-app automatic updating is not included.
`SHA256SUMS` 提供安装包校验值，`release-manifest.json` 记录来源提交与平台。本流程不包含软件内自动更新。
