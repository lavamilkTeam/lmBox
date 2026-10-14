"""Project Qt's actual task widgets through a bounded, typed interaction registry."""

import re
from pathlib import Path

from .document import finite, text_value


class Widgets:
    def __init__(self, runtime):
        self.r = runtime
        self.q = runtime.widgets
        self.qt = runtime.qt.Qt
        self.registry = {}
        self.counter = 0
        self.count = 0

    def identify(self, widget):
        identifier = widget.property("lmboxWidgetId")
        if not identifier:
            self.counter += 1
            identifier = f"w{self.counter}"
            widget.setProperty("lmboxWidgetId", identifier)
        self.registry[identifier] = widget
        return identifier

    def get(self, identifier):
        widget = self.registry.get(identifier)
        if widget is None:
            raise ValueError("Widget no longer exists")
        try:
            widget.objectName()
        except RuntimeError as error:
            self.registry.pop(identifier, None)
            raise ValueError("Widget no longer exists") from error
        if not widget.isEnabled():
            raise ValueError("Widget is disabled by the original controller")
        return widget

    def locked(self, widget):
        name = widget.objectName().lower()
        return any(
            part in name
            for part in (
                "path",
                "directory",
                "output_dir",
                "docker_url",
                "url",
                "executable",
                "foam_dir",
                "paraview",
                "gmsh_path",
                "hostfile",
                "install_dir",
            )
        )

    def node(self, widget, depth=0, root=False):
        if depth > 18 or self.count >= 1600:
            return None
        if widget.isHidden() and not root:
            return None
        if isinstance(widget, self.q.QDialogButtonBox):
            return None
        self.count += 1
        q = self.q
        node = {
            "id": self.identify(widget),
            "name": widget.objectName(),
            "qtClass": widget.metaObject().className(),
            "enabled": widget.isEnabled(),
            "visible": True,
            "kind": "container",
        }
        tooltip = widget.toolTip()
        if tooltip:
            node["tooltip"] = tooltip[:4096]
        if isinstance(widget, q.QTabWidget):
            node.update(kind="tabs", value=widget.currentIndex(), children=[])
            for index in range(widget.count()):
                child = self.node(widget.widget(index), depth + 1, root=True)
                if child:
                    child["label"] = widget.tabText(index)
                    child["enabled"] = widget.isTabEnabled(index)
                    node["children"].append(child)
        elif isinstance(widget, q.QComboBox):
            node.update(
                kind="select",
                value=widget.currentIndex(),
                options=[widget.itemText(i) for i in range(min(widget.count(), 512))],
            )
        elif isinstance(widget, (q.QCheckBox, q.QRadioButton)):
            node.update(
                kind="radio" if isinstance(widget, q.QRadioButton) else "checkbox",
                label=widget.text(),
                value=widget.isChecked(),
            )
        elif isinstance(widget, q.QAbstractButton):
            node.update(
                kind="button",
                label=widget.text(),
                value=widget.isChecked(),
                checkable=widget.isCheckable(),
            )
        elif isinstance(widget, (q.QSpinBox, q.QDoubleSpinBox)):
            node.update(
                kind="number",
                value=widget.value(),
                minimum=widget.minimum(),
                maximum=widget.maximum(),
                step=widget.singleStep(),
                readOnly=widget.isReadOnly(),
            )
        elif "InputField" in node["qtClass"] or "QuantitySpinBox" in node["qtClass"]:
            node.update(
                kind="quantity",
                value=str(widget.property("text") or ""),
                readOnly=self.locked(widget),
            )
        elif isinstance(widget, q.QLineEdit):
            node.update(
                kind="text",
                value=widget.text(),
                readOnly=widget.isReadOnly() or self.locked(widget),
            )
        elif isinstance(widget, (q.QTextEdit, q.QPlainTextEdit)):
            node.update(
                kind="text",
                value=widget.toPlainText()[:24000],
                multiline=True,
                readOnly=widget.isReadOnly() or self.locked(widget),
            )
        elif isinstance(widget, q.QLabel):
            node.update(kind="label", label=widget.text()[:16000])
        elif isinstance(widget, q.QListWidget):
            items = [widget.item(i) for i in range(min(widget.count(), 512))]
            node.update(
                kind="list",
                options=[item.text() for item in items],
                items=[
                    {
                        "id": str(index),
                        "label": item.text(),
                        **(
                            {"checkState": self.check_state(item)}
                            if self.check_state(item) is not None
                            else {}
                        ),
                    }
                    for index, item in enumerate(items)
                ],
                value=[i for i, item in enumerate(items) if item.isSelected()],
            )
        elif isinstance(widget, q.QTreeWidget):
            rows = []
            self.tree_rows(widget.invisibleRootItem(), None, rows)
            node.update(
                kind="tree",
                rows=rows,
                headers=[widget.headerItem().text(i) for i in range(widget.columnCount())],
                value=[row["id"] for row in rows if row["selected"]],
            )
        elif isinstance(widget, q.QTableWidget):
            node.update(
                kind="table",
                headers=[
                    widget.horizontalHeaderItem(i).text()
                    if widget.horizontalHeaderItem(i)
                    else str(i + 1)
                    for i in range(min(widget.columnCount(), 32))
                ],
                cells=[
                    [
                        widget.item(r, c).text() if widget.item(r, c) else ""
                        for c in range(min(widget.columnCount(), 32))
                    ]
                    for r in range(min(widget.rowCount(), 256))
                ],
                value=[
                    {"row": i.row(), "column": i.column()} for i in widget.selectedIndexes()[:512]
                ],
            )
        elif isinstance(widget, q.QProgressBar):
            node.update(
                kind="progress",
                value=widget.value(),
                minimum=widget.minimum(),
                maximum=widget.maximum(),
                label=widget.text(),
            )
        else:
            if isinstance(widget, q.QGroupBox):
                node["label"] = widget.title()
            elif widget.windowTitle():
                node["label"] = widget.windowTitle()
            if isinstance(widget, q.QScrollArea) and widget.widget():
                children = [self.node(widget.widget(), depth + 1, root=True)]
                node["children"] = [v for v in children if v]
            elif widget.layout():
                node.update(self.layout(widget.layout(), depth + 1))
            else:
                children = [
                    self.node(child, depth + 1)
                    for child in widget.findChildren(
                        q.QWidget, options=self.qt.FindDirectChildrenOnly
                    )
                ]
                node["children"] = [v for v in children if v]
                if not node["children"]:
                    node["kind"] = "unsupported"
        return node

    def layout(self, layout, depth):
        q = self.q
        kind = "vertical"
        if isinstance(layout, q.QGridLayout):
            kind = "grid"
        elif isinstance(layout, q.QFormLayout):
            kind = "form"
        elif isinstance(layout, q.QHBoxLayout):
            kind = "horizontal"
        elif isinstance(layout, q.QStackedLayout):
            kind = "stack"
        children = []
        for i in range(min(layout.count(), 512)):
            item = layout.itemAt(i)
            child = None
            if item.widget():
                child = self.node(item.widget(), depth)
            elif item.layout():
                child = {
                    "id": self.identify(item.layout()),
                    "name": "",
                    "qtClass": "QLayout",
                    "kind": "container",
                    "visible": True,
                    "enabled": True,
                    **self.layout(item.layout(), depth + 1),
                }
            if child:
                if kind == "grid":
                    row, column, row_span, column_span = layout.getItemPosition(i)
                elif kind == "form":
                    row, role = layout.getItemPosition(i)
                    column = role.value if hasattr(role, "value") else int(role)
                    row_span, column_span = 1, 2 if column == 2 else 1
                    column = min(column, 1)
                else:
                    row, column = (0, i) if kind == "horizontal" else (i, 0)
                    row_span, column_span = 1, 1
                child["placement"] = {
                    "row": row,
                    "column": column,
                    "rowSpan": row_span,
                    "columnSpan": column_span,
                }
                children.append(child)
        result = {"layout": {"type": kind}, "children": children}
        if kind == "grid":
            result["layout"]["columns"] = layout.columnCount()
        if kind == "stack":
            result["value"] = layout.currentIndex()
        return result

    def check_state(self, item):
        if not item.flags() & self.qt.ItemIsUserCheckable:
            return None
        value = item.checkState(0) if hasattr(item, "childCount") else item.checkState()
        return value.value if hasattr(value, "value") else int(value)

    def tree_rows(self, parent, parent_id, rows):
        for index in range(min(parent.childCount(), 512 - len(rows))):
            item = parent.child(index)
            identifier = f"{parent_id or 'root'}/{index}"
            row = {
                "id": identifier,
                "parentId": parent_id,
                "label": item.text(0),
                "columns": [item.text(i) for i in range(min(item.columnCount(), 32))],
                "selected": item.isSelected(),
                "expanded": item.isExpanded(),
            }
            state = self.check_state(item)
            if state is not None:
                row["checkState"] = state
            rows.append(row)
            self.tree_rows(item, identifier, rows)

    def tree_item(self, widget, identifier):
        if not isinstance(identifier, str) or not re.fullmatch(r"root(?:/\d+){1,20}", identifier):
            raise ValueError("Invalid tree item")
        item = widget.invisibleRootItem()
        for part in identifier.split("/")[1:]:
            item = item.child(int(part))
            if item is None:
                raise ValueError("Tree item no longer exists")
        return item

    def set_field(self, payload):
        widget = self.get(payload.get("fieldId", payload.get("id")))
        node = self.node(widget, root=True)
        if node is None or node.get("readOnly"):
            raise ValueError("Field is read-only")
        value = payload.get("value")
        phase = payload.get("phase", "commit")
        if phase not in {"input", "commit"}:
            raise ValueError("Invalid editing phase")
        kind = node["kind"]
        if kind in {"text", "quantity"}:
            value = text_value(value)
            # Original controllers interpolate strings into FreeCAD's command recorder.
            if any(char in value for char in ("'", "\\", "\x00", "\r", "\n")):
                raise ValueError("This native field does not accept command delimiters")
            if value.startswith(("/", "~")) or re.match(r"^[A-Za-z]:", value):
                raise ValueError("Filesystem paths are supplied by the host")
            if kind == "quantity":
                self.r.app.Units.Quantity(value)
                widget.setProperty("text", value)
            elif isinstance(widget, self.q.QLineEdit):
                widget.setText(value)
                widget.textEdited.emit(value)
            else:
                widget.setPlainText(value)
            if phase == "commit" and hasattr(widget, "editingFinished"):
                widget.editingFinished.emit()
        elif kind == "number":
            widget.setValue(finite(value))
            if phase == "commit":
                widget.editingFinished.emit()
        elif kind in {"checkbox", "radio"}:
            if not isinstance(value, bool):
                raise ValueError("Boolean required")
            if widget.isChecked() != value:
                widget.click()
        elif kind in {"select", "tabs"}:
            if (
                not isinstance(value, int)
                or isinstance(value, bool)
                or not 0 <= value < widget.count()
            ):
                raise ValueError("Invalid option index")
            widget.setCurrentIndex(value)
            if kind == "select":
                widget.activated.emit(value)
        elif kind in {"tree", "list"}:
            if kind == "tree" and isinstance(value, dict) and "expanded" in value:
                if not isinstance(value["expanded"], bool):
                    raise ValueError("Expanded state must be boolean")
                self.tree_item(widget, value.get("id")).setExpanded(value["expanded"])
            elif isinstance(value, dict) and "checkState" in value:
                state = value["checkState"]
                if state not in (0, 1, 2):
                    raise ValueError("Invalid check state")
                item = (
                    self.tree_item(widget, value.get("id"))
                    if kind == "tree"
                    else widget.item(int(value.get("index", -1)))
                )
                if item is None or not item.flags() & self.qt.ItemIsUserCheckable:
                    raise ValueError("Item cannot be checked")
                if kind == "tree":
                    item.setCheckState(0, self.qt.CheckState(state))
                else:
                    item.setCheckState(self.qt.CheckState(state))
            else:
                if not isinstance(value, list) or len(value) > 512:
                    raise ValueError("Invalid item selection")
                widget.clearSelection()
                for selected in value:
                    item = (
                        self.tree_item(widget, selected)
                        if kind == "tree"
                        else widget.item(int(selected))
                    )
                    if item is None:
                        raise ValueError("Invalid item selection")
                    item.setSelected(True)
        elif kind == "table":
            cells = value if isinstance(value, list) else [value]
            if len(cells) > 512:
                raise ValueError("Too many cells")
            widget.clearSelection()
            for cell in cells:
                row, column = cell.get("row"), cell.get("column")
                if not isinstance(row, int) or not isinstance(column, int):
                    raise ValueError("Invalid cell")
                item = widget.item(row, column)
                if item is None:
                    raise ValueError("Cell is unavailable")
                if "text" in cell:
                    if not item.flags() & self.qt.ItemIsEditable:
                        raise ValueError("Cell is read-only")
                    item.setText(text_value(cell["text"]))
                else:
                    item.setSelected(True)
        else:
            raise ValueError("Widget does not expose an editable value")

    def click(self, identifier):
        widget = self.get(identifier)
        if not isinstance(widget, self.q.QAbstractButton):
            raise ValueError("Widget is not a button")
        widget.click()

    def in_dialog(self, identifier):
        widget = self.get(identifier)
        return any(
            isinstance(dialog, self.q.QDialog)
            and dialog.isVisible()
            and dialog.isAncestorOf(widget)
            for dialog in self.q.QApplication.topLevelWidgets()
        )

    def snapshot(self):
        self.count = 0
        editor = None
        if self.r.panel:
            forms = self.r.forms()
            roots = [self.node(form, root=True) for form in forms]
            editor = {
                "id": f"editor-{self.r.editor_generation}",
                "title": forms[0].windowTitle() if forms else "CfdOF",
                "objectId": self.edited_object(),
                "roots": [v for v in roots if v],
                "actions": self.r.editor_actions(),
            }
        dialogs = []
        for dialog in self.q.QApplication.topLevelWidgets():
            if not isinstance(dialog, self.q.QDialog) or not dialog.isVisible():
                continue
            buttons = []
            for box in dialog.findChildren(self.q.QDialogButtonBox):
                for button in box.buttons():
                    if button.isVisibleTo(dialog):
                        role = box.buttonRole(button)
                        role_name = role.name if hasattr(role, "name") else str(role)
                        buttons.append(
                            {
                                "id": self.identify(button),
                                "label": button.text(),
                                "role": role_name.replace("Role", "").lower(),
                                "enabled": button.isEnabled(),
                            }
                        )
            descriptor = {
                "id": self.identify(dialog),
                "title": dialog.windowTitle(),
                "text": dialog.text() if isinstance(dialog, self.q.QMessageBox) else "",
                "buttons": buttons,
                "roots": [self.node(dialog, root=True)],
            }
            if isinstance(dialog, self.q.QFileDialog):
                mode = dialog.fileMode()
                descriptor["fileDialog"] = {
                    "mode": "directory"
                    if mode == self.q.QFileDialog.Directory
                    else (
                        "saveFile"
                        if dialog.acceptMode() == self.q.QFileDialog.AcceptSave
                        else "openFile"
                    ),
                    "fileMode": {
                        self.q.QFileDialog.ExistingFile: "file",
                        self.q.QFileDialog.ExistingFiles: "files",
                        self.q.QFileDialog.Directory: "directory",
                    }.get(mode, "any"),
                    "acceptMode": "save"
                    if dialog.acceptMode() == self.q.QFileDialog.AcceptSave
                    else "open",
                    "filters": dialog.nameFilters(),
                    "selectedFilter": dialog.selectedNameFilter(),
                    "title": dialog.windowTitle(),
                }
            dialogs.append(descriptor)
        return editor, dialogs

    def edited_object(self):
        panel = self.r.panel
        for key in ("obj", "object", "physics_obj", "mesh_obj", "solver_obj"):
            value = getattr(panel, key, None)
            if value is not None and hasattr(value, "Name"):
                return value.Name
        return None

    def dialog_response(self, payload):
        dialog = self.get(payload.get("dialogId"))
        if "path" in payload:
            if not isinstance(dialog, self.q.QFileDialog) or not dialog.isVisible():
                raise ValueError("Path selection requires an active native file dialog")
            if payload.get("trustedHostSelection") is True and payload["path"] is None:
                dialog.reject()
                return
            path = Path(text_value(payload["path"])).expanduser().resolve()
            if payload.get("trustedHostSelection") is not True:
                try:
                    path.relative_to(self.r.session)
                except ValueError as error:
                    raise ValueError("File selection requires a host-approved path") from error
            if dialog.fileMode() == self.q.QFileDialog.Directory:
                if not path.is_dir():
                    raise ValueError("Selected directory does not exist")
                dialog.setDirectory(str(path))
            else:
                if dialog.acceptMode() == self.q.QFileDialog.AcceptOpen and not path.is_file():
                    raise ValueError("Selected file does not exist")
                if not path.parent.is_dir():
                    raise ValueError("Selected parent directory does not exist")
                dialog.setDirectory(str(path.parent))
                dialog.selectFile(str(path))
            if payload.get("trustedHostSelection") is True:
                def accept_selection():
                    try:
                        dialog.selectFile(str(path))
                        entry = dialog.findChild(self.q.QLineEdit, "fileNameEdit")
                        if entry is not None:
                            entry.setText(str(path))
                        dialog.accept()
                    except RuntimeError:
                        return

                # QFileSystemModel loads directories asynchronously; apply the host selection
                # after its first update, through the original filename input and accept handler.
                self.r.qt.QTimer.singleShot(100, accept_selection)
                return
        button = self.get(payload.get("buttonId"))
        if not isinstance(dialog, self.q.QDialog) or not dialog.isAncestorOf(button):
            raise ValueError("Button does not belong to this dialog")
        self.click(payload.get("buttonId"))
