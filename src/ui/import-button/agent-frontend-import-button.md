# 前端：导入按钮外观

先读 [语言说明](../../agent-frontend.md)；维护规则与隐私要求见根规范。

## 职责与边界

公开 `ImportButton`，封装向下箭头与默认“导入”提示。

内部复用 `IconButton`。仅接收 label/tooltip/disabled 并传递点击及无障碍属性；不选择文件、不读取内容、不访问 store。业务由 import-board 连接。

## 验证

统一检查见 [语言说明](../../agent-frontend.md#验证与维护)。通过导入公开操作验证图标、提示、禁用及点击传递，保持可访问名称。
