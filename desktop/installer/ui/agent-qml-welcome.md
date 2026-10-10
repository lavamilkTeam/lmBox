# QML：安装欢迎画面

先读[Qt 安装器说明](../agent-cpp.md)。`Welcome.qml` 封装白底布局、字体、猪猪入场、标题入场和继续按钮；不访问网络、磁盘或计算核心。

字体就绪后播放入场动画。猪猪先显示静止 PNG，横向动画完整结束后才给 `AnimatedImage` 设置 GIF 来源并开始播放；文字从上方弹入。`reducedMotion` 为真时直接显示静止画面。

继续按钮打开同模块私有组件 `ModuleSelection.qml`：标题从上方弹入，选择卡片同时从下方弹入，减少动态效果时直接呈现。弹层打开时暂停背景 GIF。组件持有本次会话的 `selectedModuleIds`，分类勾选状态由子项推导，半选分类点击后全选；返回或 Escape 关闭后保留选择，并将焦点交还继续按钮。模块分类与名称是 UI 目录，不代表下载或安装能力已接通。

窗口最小尺寸为 720×480，标准尺寸为 1040×680。资源通过 Qt resource 内嵌，运行不依赖源目录或开发端口。

验证 QML 静态检查、窗口首次启动与最小尺寸、GIF 延迟播放、键盘焦点和关闭行为。`QT_QPA_PLATFORM=offscreen QT_QUICK_CONTROLS_STYLE=Basic qmltestrunner -input desktop/installer/tests` 通过真实控件点击验证分类全选、半选、组间独立、返回保留和键盘操作。
