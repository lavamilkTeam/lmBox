# Python：二维编码

先读 [语言说明](../../../../agent-python.md)；维护规则与隐私要求见根规范。

## 职责与边界

`export_contours(contours, bounds, export_format)` 接收毫米制二维环和二维 bounds，返回 SVG/DXF 文本。

`_formats.py` 私有，不读取三维网格、检查摘要、工程或文件。钢网使用接触面，底板使用建模输出的槽/斜口截面；不拿未加工板框替代结果。DWG 未实现。

## 行为约束

- 二维导出入口为 `features/export_2d.export_contours(contours, bounds, export_format)`，仅接收毫米制 XY 轮廓和 `[[minX, minY], [maxX, maxY]]` 二维边界，支持 `svg`、`dxf`；不依赖三维网格或检查摘要。两个导出模块都不访问文件系统，DWG/STEP 尚未实现。

## 验证

统一检查见 [语言说明](../../../../agent-python.md#验证与维护)。验证毫米单位、内外环、SVG/DXF 范围、钢网接触面和底板槽/斜口截面。
