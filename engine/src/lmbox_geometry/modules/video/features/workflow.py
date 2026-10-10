"""Translate only validated lmBox graph data into provider prompt data."""

import math
import re

from lmbox_geometry.contracts.ai import AiError


def credential_field(name):
    normalized = re.sub(r"[^a-z0-9]", "", name.lower())
    return any(
        part in normalized
        for part in ("apikey", "authtoken", "accesstoken", "password", "secret", "authorization")
    )


def _input_spec(spec):
    """Normalize legacy enum lists and current ComfyUI V3 COMBO inputs."""
    kind = spec[0]
    options = spec[1] if len(spec) > 1 and isinstance(spec[1], dict) else {}
    choices = (
        kind if isinstance(kind, list) else options.get("options") if kind == "COMBO" else None
    )
    if kind == "COMFY_DYNAMICCOMBO_V3":
        choices = [
            item["key"]
            for item in options.get("options", [])
            if isinstance(item, dict) and isinstance(item.get("key"), str)
        ]
    return kind, options, choices


def definitions(metadata):
    result = []
    for name, node in metadata.items():
        if not isinstance(node, dict):
            continue
        inputs = []
        for group in ("required", "optional"):
            for key, spec in node.get("input", {}).get(group, {}).items():
                if not isinstance(spec, list) or not spec:
                    continue
                kind, options, choices = _input_spec(spec)
                item = {
                    "name": key,
                    "type": "COMBO" if isinstance(kind, list) else str(kind),
                    "required": group == "required",
                }
                if isinstance(choices, list) and not credential_field(key):
                    item["choices"] = [
                        value for value in choices if type(value) in (str, int, float, bool)
                    ]
                for option in ("default", "min", "max"):
                    if option in options and not credential_field(key):
                        item[option] = options[option]
                inputs.append(item)
        names = node.get("output_name", [])
        outputs = [
            {"name": str(names[i]) if i < len(names) else str(kind), "type": str(kind)}
            for i, kind in enumerate(node.get("output", []))
        ]
        result.append(
            {
                "type": name,
                "title": node.get("display_name") or name,
                "category": node.get("category") or "",
                "inputs": inputs,
                "outputs": outputs,
            }
        )
    return result


def _invalid(message):
    raise AiError("invalid_workflow", message)


def _literal(value, spec, label):
    kind, options, choices = _input_spec(spec)
    if options.get("forceInput"):
        _invalid(f"{label} requires a connection.")
    if isinstance(value, list):
        # ComfyUI interprets arrays as links. Do not allow a raw JSON literal to
        # bypass our connection type/dangling/cycle checks at the provider seam.
        _invalid(f"{label} cannot use a raw array; use an explicit node connection.")
    if isinstance(choices, list):
        if value not in choices:
            _invalid(f"{label} is not an available choice.")
    elif kind in ("INT", "FLOAT"):
        numeric = type(value) in (int, float) and math.isfinite(value)
        if not numeric or (kind == "INT" and type(value) is not int):
            _invalid(f"{label} requires a finite {kind.lower()} value.")
        if value < options.get("min", -math.inf) or value > options.get("max", math.inf):
            _invalid(f"{label} is outside the allowed range.")
    elif kind == "STRING" and not isinstance(value, str):
        _invalid(f"{label} requires text.")
    elif kind == "BOOLEAN" and type(value) is not bool:
        _invalid(f"{label} requires a boolean.")
    elif kind not in ("STRING", "BOOLEAN", "*"):
        _invalid(f"{label} requires a {kind} connection.")


def _expanded_specs(groups, supplied):
    """Flatten only selected V3 branches; use declared defaults for omitted widgets."""
    specs, required = {}, set()

    def expand(group, prefix="", depth=0):
        if depth > 16 or len(specs) > 512:
            _invalid("Dynamic node inputs exceed the supported size or depth.")
        for section in ("required", "optional"):
            for field, spec in group.get(section, {}).items():
                name = prefix + field
                if not isinstance(spec, list) or not spec:
                    _invalid("Unsupported dynamic input metadata.")
                specs[name] = spec
                if section == "required":
                    required.add(name)
                kind, options, choices = _input_spec(spec)
                if prefix and section == "required" and name not in supplied:
                    if not credential_field(name):
                        if "default" in options:
                            supplied[name] = options["default"]
                        elif choices:
                            supplied[name] = choices[0]
                if kind == "COMFY_DYNAMICCOMBO_V3" and name in supplied:
                    selected = supplied[name]
                    if not isinstance(selected, str):
                        _invalid(f"{name} requires an explicit dynamic option.")
                    _literal(selected, spec, name)
                    branch = next(item for item in options["options"] if item["key"] == selected)
                    expand(branch.get("inputs", {}), name + ".", depth + 1)

    expand(groups)
    return specs, required


def to_prompt(workflow, metadata, credentials=None):
    nodes = workflow.get("nodes") if isinstance(workflow, dict) else None
    if not isinstance(nodes, list) or not 1 <= len(nodes) <= 512:
        _invalid("A video workflow must contain 1 to 512 nodes.")
    indexed = {}
    for node in nodes:
        if not isinstance(node, dict):
            _invalid("Invalid workflow node.")
        node_id = node.get("id")
        if not isinstance(node_id, str) or not node_id or len(node_id) > 128 or node_id in indexed:
            _invalid("Workflow node identifiers must be unique nonempty strings.")
        if node.get("type") not in metadata or not isinstance(node.get("inputs"), dict):
            _invalid("Workflow contains an unavailable node or invalid inputs.")
        indexed[node_id] = node
    prompt, edges = {}, {}
    for node_id, node in indexed.items():
        description = metadata[node["type"]]
        groups = description.get("input", {})
        supplied = dict(node["inputs"])
        if any(credential_field(name) for name in supplied):
            _invalid("Credentials must be configured by the host, not stored in workflows.")
        base_specs = {**groups.get("required", {}), **groups.get("optional", {})}
        for name, value in (credentials or {}).get(node["type"], {}).items():
            if name in base_specs:
                supplied[name] = value
        specs, required = _expanded_specs(groups, supplied)
        if set(supplied) - set(specs):
            _invalid(f"Node {node_id} contains unknown inputs.")
        missing = required - set(supplied)
        if any(credential_field(name) for name in missing):
            raise AiError("missing_credentials", "A workflow node requires host credentials.")
        if missing:
            _invalid(f"Node {node_id} is missing required inputs.")
        inputs, dependencies = {}, []
        for name, value in supplied.items():
            spec = specs[name]
            if not isinstance(spec, list) or not spec:
                _invalid("Node metadata contains an unsupported input specification.")
            if isinstance(value, dict) and set(value) == {"nodeId", "outputIndex"}:
                source, port = value["nodeId"], value["outputIndex"]
                if (
                    not isinstance(source, str)
                    or source not in indexed
                    or type(port) is not int
                    or port < 0
                ):
                    _invalid("Workflow contains a dangling connection.")
                outputs = metadata[indexed[source]["type"]].get("output", [])
                if port >= len(outputs):
                    _invalid("Workflow connection references a missing output.")
                expected = "COMBO" if isinstance(spec[0], list) else spec[0]
                actual = outputs[port]
                if expected != "*" and actual != "*" and actual not in expected.split(","):
                    _invalid(f"Connection to {node_id}.{name} has an incompatible type.")
                inputs[name] = [source, port]
                dependencies.append(source)
            else:
                _literal(value, spec, f"{node_id}.{name}")
                inputs[name] = value
        prompt[node_id] = {"class_type": node["type"], "inputs": inputs}
        edges[node_id] = dependencies
    done, visiting = set(), set()

    def visit(node_id):
        if node_id in visiting:
            _invalid("Workflow connections contain a cycle.")
        if node_id in done:
            return
        visiting.add(node_id)
        for source in edges[node_id]:
            visit(source)
        visiting.remove(node_id)
        done.add(node_id)

    for node_id in indexed:
        visit(node_id)
    if not any(metadata[node["type"]].get("output_node") for node in nodes):
        _invalid("Workflow requires an output node that saves generated media.")
    return prompt
