# 前端：共享 shadcn-vue 原语

先读 [语言说明](../../agent-frontend.md) 与 [外观规范](../agent-frontend-ui.md)。`index.ts` 是组件与 `cn` 的公开入口；官方实现及必要适配留在 `lib`，外部不能深层导入。原语只处理展示、可访问性与控件交互，不依赖业务状态、协议或平台。

组件来源为 shadcn-vue 官方 new-york-v4 registry，保留本目录 `LICENSE` 与 `NOTICE`。行为基础使用 Reka UI；主题与通知由 [共享主题](../theme/agent-frontend-theme.md) 组装。内部 variant 与组件实现分开，避免内部 barrel 引入循环依赖。

卡片按实际使用公开 `Card`、`CardHeader`、`CardTitle` 和 `CardFooter`；沿用官方实现，类名通过 `cn` 合并。业务节点的定位、尺寸和拖动行为由所属模块 UI 负责，不进入共享卡片。

应用与安装器的 Vite 构建均复制本目录 `LICENSE`、`NOTICE` 到发布资源中；修改来源声明时保持两种产物一致。

表单使用 `modelValue`，展开类控件使用 `open`；`Slider` 值为数组。保留原语的键盘、焦点管理和禁用行为。`Input` 额外公开 `input` 元素与 `focus()`；文件选择仍可使用原生隐藏 input。业务确认通过 `AlertDialog` 的受控状态和事件组合，不在共享 UI 执行业务动作。

`Tooltip` 的 `role="tooltip"` 与描述 ID 放在可见浮层，触发器引用该 ID；隐藏 Reka 的重复文本节点。定位、悬停容错区域、开关时机与 Escape 仍由原语维护。

验证运行前端边界、类型、构建与浏览器交互检查；检查对象包含弹层焦点、Escape、键盘选择、禁用和单位输入。
