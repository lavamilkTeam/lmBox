"""Shared request validation and library-neutral mesh data."""

import json
from dataclasses import dataclass
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

SCHEMAS = Path(__file__).resolve().parents[4] / "contracts" / "schemas"


@dataclass
class Mesh:
    positions: list
    indices: list
    contours: list
    area: float
    thickness: float
    hole_count: int
    expected_volume: float = None
    objects: list = None


def validate_request(request):
    schema = json.loads((SCHEMAS / "v1" / "preview.schema.json").read_text())
    graphics = json.loads((SCHEMAS / "v2" / "graphics.schema.json").read_text())
    registry = Registry().with_resource(graphics["$id"], Resource.from_contents(graphics))
    Draft202012Validator(schema, registry=registry).validate(request)
    # JSON schema numeric constraints must also reject non-finite Python floats.
    json.dumps(request, allow_nan=False)
    return request
