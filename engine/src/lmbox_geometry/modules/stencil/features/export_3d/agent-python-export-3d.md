# Python：三维编码

先读 [语言说明](../../../../../../agent-python.md)；维护规则与隐私要求见根规范。

## 职责与边界

`export_mesh(mesh, export_format)` 接收已检查网格，返回 ASCII STL 文本。

`_stl.py` 私有；不重新建模或检查，不访问工程及文件，不依赖二维导出。STEP 尚未实现，STL 不宣称为 CAD 实体。

## 行为约束

- 三维导出入口为 `features/export_3d.export_mesh(mesh, export_format)`，接收调用方已检查的网格并返回文件文本。当前只支持 `stl`，不重复建模或检查，不读取工程状态。

## 验证

统一检查见 [语言说明](../../../../../../agent-python.md#验证与维护)。独立读取导出 STL，验证尺寸、闭合、斜壁中间截面和孔形，不只比较编码字符串。
