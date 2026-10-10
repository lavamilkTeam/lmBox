"""Bounded native document snapshots and typed property/selection adaptation."""

import importlib
import math
import re

from .files import validate_document

MAX_OBJECTS = 256
MAX_TRIANGLES = 100000
LINK_KINDS = {
    "App::PropertyLinkGlobal": "App::PropertyLink",
    "App::PropertyLinkSubGlobal": "App::PropertyLinkSub",
    "App::PropertyLinkListGlobal": "App::PropertyLinkList",
    "App::PropertyLinkSubListGlobal": "App::PropertyLinkSubList",
}
SCALARS = {
    "App::PropertyBool",
    "App::PropertyInteger",
    "App::PropertyIntegerConstraint",
    "App::PropertyFloat",
    "App::PropertyFloatConstraint",
    "App::PropertyString",
    "App::PropertyEnumeration",
    "App::PropertyStringList",
    "App::PropertyIntegerList",
    "App::PropertyFloatList",
    "App::PropertyVector",
    "App::PropertyVectorDistance",
    "App::PropertyPosition",
    "App::PropertyMap",
    "App::PropertyLink",
    "App::PropertyLinkSub",
    "App::PropertyLinkList",
    "App::PropertyLinkSubList",
} | set(LINK_KINDS)
QUANTITIES = {
    "App::PropertyQuantity",
    "App::PropertyLength",
    "App::PropertyDistance",
    "App::PropertyAngle",
    "App::PropertyArea",
    "App::PropertyVolume",
    "App::PropertySpeed",
    "App::PropertyAcceleration",
    "App::PropertyForce",
    "App::PropertyPressure",
    "App::PropertyTemperature",
    "App::PropertyTime",
    "App::PropertyFrequency",
    "App::PropertyMass",
    "App::PropertyDensity",
    "App::PropertyKinematicViscosity",
    "App::PropertyDynamicViscosity",
    "App::PropertySpecificHeat",
    "App::PropertyThermalConductivity",
}
LOCKED = {
    "OutputPath",
    "HostfileName",
    "FileName",
    "ExpressionEngine",
    "Placement",
    "Shape",
    "Proxy",
    "Group",
    "Visibility",
    "Label2",
}


def text_value(value, limit=4096):
    if not isinstance(value, str) or len(value) > limit or "\x00" in value:
        raise ValueError("Invalid text value")
    return value


def finite(value):
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value):
        raise ValueError("A finite number is required")
    return value


def encode(value, depth=0):
    if depth > 5:
        return None
    if value is None or isinstance(value, (str, bool, int)):
        return value[:4096] if isinstance(value, str) else value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {str(k)[:128]: encode(v, depth + 1) for k, v in list(value.items())[:64]}
    if isinstance(value, (list, tuple)):
        return [encode(v, depth + 1) for v in value[:256]]
    if hasattr(value, "UserString"):
        return str(value.UserString)
    if hasattr(value, "x") and hasattr(value, "y") and hasattr(value, "z"):
        return {k: encode(getattr(value, k), depth + 1) for k in ("x", "y", "z")}
    if hasattr(value, "Name"):
        return {"objectId": value.Name}
    return str(value)[:4096]


class Document:
    def __init__(self, runtime):
        self.r = runtime
        self.exposed = {}
        self.geometry_cache = {}

    def object(self, name):
        if not isinstance(name, str) or not self.r.app.ActiveDocument:
            raise ValueError("Document object is unavailable")
        obj = self.r.app.ActiveDocument.getObject(name)
        if obj is None:
            raise ValueError("Document object is unavailable")
        return obj

    def properties(self, obj):
        result = []
        for name in obj.PropertiesList[:160]:
            kind = obj.getTypeIdOfProperty(name)
            link_kind = LINK_KINDS.get(kind, kind)
            if kind not in SCALARS | QUANTITIES and name not in {
                "OutputPath",
                "InputCaseName",
                "CaseName",
            }:
                continue
            mode = obj.getEditorMode(name)
            hidden = mode == 2 or (isinstance(mode, (list, tuple)) and "Hidden" in mode)
            if hidden:
                continue
            try:
                native_value = getattr(obj, name)
                value = encode(native_value)
                if link_kind == "App::PropertyLinkSub" and native_value:
                    value = {"objectId": native_value[0].Name, "subelements": list(native_value[1])}
                elif link_kind == "App::PropertyLinkSubList":
                    value = [
                        {"objectId": item[0].Name, "subelements": list(item[1])}
                        for item in native_value
                    ]
                read_only = (
                    mode == 1
                    or name in LOCKED
                    or (isinstance(mode, (list, tuple)) and "ReadOnly" in mode)
                )
                if kind in {
                    "App::PropertyVector",
                    "App::PropertyVectorDistance",
                    "App::PropertyPosition",
                }:
                    value = {
                        axis: float(getattr(native_value, axis).Value)
                        if hasattr(getattr(native_value, axis), "Value")
                        else float(getattr(native_value, axis))
                        for axis in ("x", "y", "z")
                    }
                descriptor = {
                    "name": name,
                    "type": kind,
                    "group": obj.getGroupOfProperty(name),
                    "readOnly": read_only,
                    "value": value,
                }
                if kind == "App::PropertyEnumeration":
                    descriptor["options"] = list(obj.getEnumerationsOfProperty(name))
                result.append(descriptor)
                if not read_only:
                    self.exposed[(obj.Name, name)] = descriptor
            except (AttributeError, RuntimeError, TypeError):
                continue
        return result

    def snapshot(self):
        self.exposed = {}
        doc = self.r.app.ActiveDocument
        if doc is None:
            return {"name": "", "label": "", "objects": []}
        objects = []
        for obj in doc.Objects[:MAX_OBJECTS]:
            parent = obj.getParentGroup()
            objects.append(
                {
                    "id": obj.Name,
                    "label": obj.Label,
                    "type": obj.TypeId,
                    "visible": bool(obj.ViewObject.Visibility),
                    "parentId": parent.Name if parent else None,
                    "children": [item.Name for item in getattr(obj, "Group", [])],
                    "properties": self.properties(obj),
                }
            )
        return {
            "name": doc.Name,
            "label": doc.Label,
            "objects": objects,
            "truncated": len(doc.Objects) > MAX_OBJECTS,
        }

    def reference(self, value):
        if not isinstance(value, dict):
            raise ValueError("An object reference is required")
        obj = self.object(value.get("objectId"))
        subs = value.get("subelements", [])
        if not isinstance(subs, list) or len(subs) > 512:
            raise ValueError("Invalid subelement selection")
        for sub in subs:
            if not isinstance(sub, str) or not re.fullmatch(
                r"(?:Face|Edge|Vertex|Solid)[1-9]\d*", sub
            ):
                raise ValueError("Invalid shape subelement")
            if not hasattr(obj, "Shape"):
                raise ValueError("This object has no selectable shape")
            obj.Shape.getElement(sub)
        return obj, subs

    def select(self, payload):
        obj, subs = self.reference(payload)
        append = payload.get("append", False)
        if not isinstance(append, bool):
            raise ValueError("Boolean append required")
        if not append:
            self.r.gui.Selection.clearSelection()
        for sub in subs or [""]:
            self.r.gui.Selection.addSelection(obj, sub)

    def edit_object(self, payload):
        obj = self.object(payload.get("objectId"))
        if self.r.panel:
            raise ValueError("Close the current editor first")
        proxy = getattr(obj.ViewObject, "Proxy", None)
        if proxy and hasattr(proxy, "doubleClicked"):
            proxy.doubleClicked(obj.ViewObject)
        elif not self.r.gui.activeDocument().setEdit(obj.Name):
            raise ValueError("Object has no native editor")

    def set_visibility(self, payload):
        if not isinstance(payload.get("visible"), bool):
            raise ValueError("Boolean visibility required")
        self.object(payload.get("objectId")).ViewObject.Visibility = payload["visible"]

    def delete_object(self, payload):
        if self.r.panel:
            raise ValueError("Close the current editor first")
        self.select(payload)
        self.r.gui.runCommand("Std_Delete", 0)

    def history(self, operation):
        if self.r.panel:
            raise ValueError("Close the current editor first")
        if operation not in {"undo", "redo"}:
            raise ValueError("Invalid history operation")
        getattr(self.r.app.ActiveDocument, operation)()

    def set_property(self, payload):
        key = (payload.get("objectId"), payload.get("name"))
        descriptor = self.exposed.get(key)
        if descriptor is None:
            raise ValueError("Property is not exposed for editing")
        obj = self.object(key[0])
        kind = LINK_KINDS.get(descriptor["type"], descriptor["type"])
        value = payload.get("value")
        if key[1] in {"CaseName", "InputCaseName"}:
            if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z][\w-]{0,63}", value):
                raise ValueError("Case names must be simple directory names")
        elif kind in QUANTITIES:
            value = self.r.app.Units.Quantity(text_value(value))
            if not math.isfinite(value.Value):
                raise ValueError("Invalid quantity")
        elif kind == "App::PropertyBool":
            if not isinstance(value, bool):
                raise ValueError("A boolean is required")
        elif kind in {"App::PropertyInteger", "App::PropertyIntegerConstraint"}:
            finite(value)
            if not isinstance(value, int):
                raise ValueError("An integer is required")
        elif kind in {"App::PropertyFloat", "App::PropertyFloatConstraint"}:
            value = finite(value)
        elif kind == "App::PropertyEnumeration":
            if value not in descriptor["options"]:
                raise ValueError("Unsupported property option")
        elif kind == "App::PropertyString":
            value = text_value(value)
        elif kind in {
            "App::PropertyVector",
            "App::PropertyVectorDistance",
            "App::PropertyPosition",
        }:
            if not isinstance(value, dict) or set(value) != {"x", "y", "z"}:
                raise ValueError("A three-component vector is required")
            value = self.r.app.Vector(*(finite(value[k]) for k in ("x", "y", "z")))
        elif kind == "App::PropertyMap":
            if not isinstance(value, dict) or len(value) > 64:
                raise ValueError("Invalid property map")
            value = {text_value(k, 128): text_value(v) for k, v in value.items()}
        elif kind == "App::PropertyLink":
            value = None if value is None else self.reference(value)[0]
        elif kind == "App::PropertyLinkSub":
            value = self.reference(value)
        elif kind in {"App::PropertyLinkList", "App::PropertyLinkSubList"}:
            if not isinstance(value, list) or len(value) > 256:
                raise ValueError("Invalid reference list")
            value = [self.reference(v) for v in value]
            if kind == "App::PropertyLinkList":
                value = [v[0] for v in value]
        elif kind.endswith("List"):
            if not isinstance(value, list) or len(value) > 256:
                raise ValueError("Invalid property list")
            converter = text_value if kind == "App::PropertyStringList" else finite
            value = [converter(v) for v in value]
            if kind == "App::PropertyIntegerList" and any(not isinstance(v, int) for v in value):
                raise ValueError("Integer list required")
        else:
            raise ValueError("Property type is not editable through this adapter")
        obj.Document.openTransaction("Edit CFD property")
        try:
            setattr(obj, key[1], value)
            obj.Document.recompute()
            obj.Document.commitTransaction()
        except Exception:
            obj.Document.abortTransaction()
            raise

    def import_file(self, payload):
        path = self.r.staged_file(payload.get("path"))
        suffix = path.suffix.lower()
        app = self.r.app
        if self.r.panel:
            raise ValueError("Close the current editor before importing")
        if suffix == ".fcstd":
            validate_document(path)
            old = app.ActiveDocument.Name
            app.closeDocument(old)
            app.openDocument(str(path))
        elif suffix in {".step", ".stp", ".iges", ".igs", ".brep", ".brp"}:
            importlib.import_module("Part").insert(str(path), app.ActiveDocument.Name)
        elif suffix in {".stl", ".obj", ".ply"}:
            importlib.import_module("Mesh").insert(str(path), app.ActiveDocument.Name)
        else:
            raise ValueError("Unsupported CAD format")
        for obj in app.ActiveDocument.Objects:
            if "OutputPath" in obj.PropertiesList:
                obj.OutputPath = str(self.r.session / "output")
        app.ActiveDocument.recompute()
        analysis = self.r.tools.getActiveAnalysis()
        if analysis:
            self.r.tools.setActiveAnalysis(analysis)

    def export_document(self):
        path = self.r.session / "session.FCStd"
        self.r.app.ActiveDocument.recompute()
        self.r.app.ActiveDocument.saveAs(str(path))
        return {"name": path.name, "path": str(path)}

    def geometry(self):
        doc = self.r.app.ActiveDocument
        if doc is None:
            return []
        result = []
        remaining = MAX_TRIANGLES
        for obj in doc.Objects[:MAX_OBJECTS]:
            if not obj.ViewObject.Visibility:
                continue
            if hasattr(obj, "FemMesh"):
                mesh = obj.FemMesh
                item = {
                    "objectId": obj.Name,
                    "label": obj.Label,
                    "vertices": [],
                    "triangles": [],
                    "faces": [],
                    "edges": [],
                    "points": [],
                    "solids": [],
                    "truncated": False,
                }
                indices = {}
                for face_id in mesh.Faces:
                    nodes = mesh.getElementNodes(face_id)
                    if len(nodes) in {3, 6}:
                        triangles = (nodes[:3],)
                    elif len(nodes) in {4, 8, 9}:
                        triangles = (nodes[:3], (nodes[2], nodes[3], nodes[0]))
                    else:
                        item["truncated"] = True
                        continue
                    if len(item["triangles"]) // 3 + len(triangles) > remaining:
                        item["truncated"] = True
                        break
                    for triangle in triangles:
                        for index in triangle:
                            if index not in indices:
                                vertex = mesh.getNodeById(index)
                                indices[index] = len(indices)
                                item["vertices"].extend(float(finite(c)) for c in vertex)
                            item["triangles"].append(indices[index])
                if item["triangles"]:
                    result.append(item)
                    remaining -= len(item["triangles"]) // 3
                if remaining <= 0:
                    break
                continue
            if hasattr(obj, "Mesh"):
                vertices, triangles = obj.Mesh.Topology
                item = {
                    "objectId": obj.Name,
                    "label": obj.Label,
                    "vertices": [],
                    "triangles": [],
                    "faces": [],
                    "edges": [],
                    "points": [],
                    "solids": [],
                    "truncated": len(triangles) > remaining,
                }
                indices = {}
                for triangle in triangles[:remaining]:
                    for index in triangle:
                        if index not in indices:
                            vertex = vertices[index]
                            indices[index] = len(indices)
                            item["vertices"].extend(float(finite(c)) for c in vertex)
                        item["triangles"].append(indices[index])
                if item["triangles"]:
                    result.append(item)
                    remaining -= len(item["triangles"]) // 3
                if remaining <= 0:
                    break
                continue
            if not hasattr(obj, "Shape"):
                continue
            shape = obj.Shape
            if shape.isNull() or not shape.Faces:
                continue
            signature = (obj.Name, shape.hashCode(), obj.Label, remaining)
            item = self.geometry_cache.get(signature)
            if item is None:
                item = {
                    "objectId": obj.Name,
                    "label": obj.Label,
                    "vertices": [],
                    "triangles": [],
                    "faces": [],
                }
                for index, face in enumerate(shape.Faces[:2048]):
                    vertices, triangles = face.tessellate(
                        max(shape.BoundBox.DiagonalLength / 500, 0.01)
                    )
                    if len(item["triangles"]) // 3 + len(triangles) > remaining:
                        item["truncated"] = True
                        break
                    offset = len(item["vertices"]) // 3
                    start = len(item["triangles"]) // 3
                    item["vertices"].extend(float(c) for v in vertices for c in (v.x, v.y, v.z))
                    item["triangles"].extend(offset + i for triangle in triangles for i in triangle)
                    item["faces"].append(
                        {
                            "id": f"Face{index + 1}",
                            "firstTriangle": start,
                            "triangleCount": len(triangles),
                        }
                    )
                if len(self.geometry_cache) > 128:
                    self.geometry_cache.clear()
                item["edges"] = []
                for index, edge in enumerate(shape.Edges[:4096]):
                    points = edge.discretize(Number=16)
                    item["edges"].append(
                        {
                            "id": f"Edge{index + 1}",
                            "vertices": [
                                float(c) for point in points for c in (point.x, point.y, point.z)
                            ],
                        }
                    )
                item["points"] = [
                    {
                        "id": f"Vertex{index + 1}",
                        "position": [
                            float(vertex.Point.x),
                            float(vertex.Point.y),
                            float(vertex.Point.z),
                        ],
                    }
                    for index, vertex in enumerate(shape.Vertexes[:4096])
                ]
                item["solids"] = [
                    {
                        "id": f"Solid{index + 1}",
                        "faces": [
                            f"Face{face_index + 1}"
                            for face_index, face in enumerate(shape.Faces[:2048])
                            if any(face.isSame(candidate) for candidate in solid.Faces)
                        ],
                    }
                    for index, solid in enumerate(shape.Solids[:256])
                ]
                self.geometry_cache[signature] = item
            result.append(item)
            remaining -= len(item["triangles"]) // 3
            if remaining <= 0:
                break
        return result
