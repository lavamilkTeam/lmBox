"""Validate staged native documents before FreeCAD restores Python proxies."""

import base64
import json
import sys
import xml.etree.ElementTree as ET
import zipfile


def validate_document(path):
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        if len(entries) > 4096 or sum(item.file_size for item in entries) > 512 * 1024 * 1024:
            raise ValueError("Native document exceeds decompression limits")
        for name in ("Document.xml", "GuiDocument.xml"):
            if name not in archive.namelist():
                continue
            if archive.getinfo(name).file_size > 16 * 1024 * 1024:
                raise ValueError("Native document metadata exceeds limits")
            data = archive.read(name)
            if b"<!DOCTYPE" in data or b"<!ENTITY" in data:
                raise ValueError("Native document contains unsupported XML declarations")
            root = ET.fromstring(data)
            for proxy in root.iter("Python"):
                module_name, class_name = proxy.get("module", ""), proxy.get("class", "")
                module = sys.modules.get(module_name)
                if (
                    not module_name.startswith("CfdOF.")
                    or module is None
                    or not class_name.lstrip("_").startswith(("Cfd", "ViewProvider"))
                    or not isinstance(getattr(module, class_name, None), type)
                ):
                    raise ValueError("Native document contains an unsupported Python proxy")
                data = proxy.get("value", "")
                if proxy.get("encoded") == "yes":
                    data = base64.b64decode(data, validate=True).decode("utf-8")
                try:
                    json.loads(data)
                except (ValueError, UnicodeError) as error:
                    raise ValueError(
                        "Native document contains a non-JSON Python payload"
                    ) from error
