"""Trusted pvpython entry point: bounded projections of native OpenFOAM results."""

import json
import math
import re
import sys
from pathlib import Path


def extract(case, output, requested_time):
    # VTK objects stay inside this process; no vendor objects cross the protocol.
    from vtkmodules.vtkCommonCore import vtkPoints
    from vtkmodules.vtkCommonDataModel import vtkPlane, vtkPolyData
    from vtkmodules.vtkFiltersCore import (
        vtkAppendFilter,
        vtkAppendPolyData,
        vtkCutter,
        vtkTriangleFilter,
    )
    from vtkmodules.vtkFiltersFlowPaths import vtkStreamTracer
    from vtkmodules.vtkFiltersGeometry import vtkGeometryFilter
    from vtkmodules.vtkIOParallel import vtkPOpenFOAMReader

    marker = case / "pv.foam"
    marker.touch(exist_ok=True)
    reader = vtkPOpenFOAMReader()
    reader.SetFileName(str(marker))
    reader.SetCaseType(0 if (case / "processor0").is_dir() else 1)
    reader.UpdateInformation()
    times = reader.GetTimeValues()
    time = max(
        times.GetValue(i)
        for i in range(times.GetNumberOfTuples())
        if times.GetValue(i) <= requested_time
    )
    if time <= 0:
        raise ValueError("尚无已写出的计算结果")
    patches = reader.GetPatchDataArraySelection()
    patches.EnableArray("internalMesh")
    patches.EnableArray("group/wall")
    reader.UpdateTimeStep(time)
    volume, wall = vtkAppendFilter(), vtkAppendPolyData()
    iterator = reader.GetOutput().NewIterator()
    iterator.InitTraversal()
    while not iterator.IsDoneWithTraversal():
        data = iterator.GetCurrentDataObject()
        # Internal grids are 3D cells; selected wall patches are polydata.
        if data and data.GetNumberOfCells():
            if data.IsA("vtkUnstructuredGrid"):
                volume.AddInputData(data)
            elif data.IsA("vtkPolyData"):
                wall.AddInputData(data)
        iterator.GoToNextItem()
    volume.MergePointsOn()
    volume.Update()
    wall.Update()
    fluid = volume.GetOutput()
    surface = wall.GetOutput()
    if not fluid.GetNumberOfCells() or not surface.GetNumberOfCells():
        raise ValueError("结果缺少体网格或壁面区域")
    bounds = surface.GetBounds()
    center = [(bounds[i * 2] + bounds[i * 2 + 1]) / 2 for i in range(3)]
    plane = vtkPlane()
    plane.SetOrigin(*center)
    plane.SetNormal(0, 0, 1)
    # Keep a local section around the body instead of filling the farfield box.
    length = max(bounds[i * 2 + 1] - bounds[i * 2] for i in range(3))
    from vtkmodules.vtkCommonDataModel import vtkBox
    from vtkmodules.vtkFiltersExtraction import vtkExtractGeometry

    box = vtkBox()
    box.SetBounds(
        bounds[0] - length * 0.25,
        bounds[1] + length * 0.6,
        bounds[2] - length * 0.35,
        bounds[3] + length * 0.35,
        bounds[4] - length * 0.15,
        bounds[5] + length * 0.15,
    )
    local = vtkExtractGeometry()
    local.SetInputData(fluid)
    local.SetImplicitFunction(box)
    local.ExtractInsideOn()
    local.ExtractBoundaryCellsOn()
    local.Update()
    section = vtkCutter()
    section.SetInputData(local.GetOutput())
    section.SetCutFunction(plane)
    section.Update()

    pressure_header = (case / "0/p").read_text(errors="replace")[:4096]
    pressure_unit = (
        "Pa"
        if re.search(r"dimensions\s*\[1\s+-1\s+-2\s+0\s+0\s+0\s+0\]", pressure_header)
        else "m²/s²"
    )
    fields = [
        ("p", "压力", pressure_unit),
        ("U", "速度", "m/s"),
        ("T", "温度", "K"),
        ("Ma", "马赫数", ""),
    ]
    fields = [f for f in fields if fluid.GetPointData().GetArray(f[0]) is not None]
    if not any(f[0] == "U" for f in fields):
        raise ValueError("结果缺少速度场 U")

    def values(data, indices):
        result = {}
        for name, _, _ in fields:
            array = data.GetPointData().GetArray(name)
            if array is None:
                continue
            result[name] = [
                math.sqrt(sum(v * v for v in array.GetTuple(i)))
                if name == "U"
                else array.GetTuple1(i)
                for i in indices
            ]
        return result

    def mesh(data):
        geometry = vtkGeometryFilter()
        geometry.SetInputData(data)
        geometry.Update()
        triangles = vtkTriangleFilter()
        triangles.SetInputData(geometry.GetOutput())
        triangles.Update()
        poly = triangles.GetOutput()
        indices, vertices, faces, mapping = [], [], [], {}
        count = min(poly.GetNumberOfCells(), 120000)
        for i in range(count):
            cell = poly.GetCell(i)
            if cell.GetNumberOfPoints() != 3:
                continue
            for j in range(3):
                point = cell.GetPointId(j)
                if point not in mapping:
                    mapping[point] = len(indices)
                    indices.append(point)
                    vertices.extend(poly.GetPoint(point))
                faces.append(mapping[point])
        return {
            "vertices": vertices,
            "triangles": faces,
            "fields": values(poly, indices),
            "truncated": poly.GetNumberOfCells() > count,
        }

    points = vtkPoints()
    # A reproducible upstream rake; integration uses the actual native U field.
    for j in range(19):
        for k in range(25):
            points.InsertNextPoint(
                bounds[0] - length * 0.18,
                bounds[2] - length * 0.10 + (bounds[3] - bounds[2] + length * 0.20) * j / 18,
                bounds[4] - length * 0.05 + (bounds[5] - bounds[4] + length * 0.10) * k / 24,
            )
    seeds = vtkPolyData()
    seeds.SetPoints(points)
    trace = vtkStreamTracer()
    trace.SetInputData(fluid)
    trace.SetSourceData(seeds)
    trace.SetInputArrayToProcess(0, 0, 0, 0, "U")
    trace.SetIntegratorTypeToRungeKutta45()
    trace.SetIntegrationDirectionToForward()
    trace.SetMaximumPropagation(length * 2.4)
    trace.SetInitialIntegrationStep(0.15)
    trace.SetMaximumNumberOfSteps(1200)
    trace.Update()
    lines = trace.GetOutput()
    line_indices, line_vertices, segments, line_mapping = [], [], [], {}
    capped = False
    for i in range(lines.GetNumberOfCells()):
        cell = lines.GetCell(i)
        for j in range(cell.GetNumberOfPoints() - 1):
            if len(segments) >= 200000:
                capped = True
                break
            for point in (cell.GetPointId(j), cell.GetPointId(j + 1)):
                if point not in line_mapping:
                    line_mapping[point] = len(line_indices)
                    line_indices.append(point)
                    line_vertices.extend(lines.GetPoint(point))
                segments.append(line_mapping[point])
        if capped:
            break
    section_data = section.GetOutput()
    sample = list(
        range(
            0,
            section_data.GetNumberOfPoints(),
            max(1, math.ceil(section_data.GetNumberOfPoints() / 2500)),
        )
    )
    vectors = section_data.GetPointData().GetArray("U")
    payload = {
        "time": time,
        "coordinateUnit": "m",
        "surface": mesh(surface),
        "slice": mesh(section_data),
        "streamlines": {
            "vertices": line_vertices,
            "segments": segments,
            "fields": values(lines, line_indices),
            "truncated": capped,
        },
        "vectors": {
            "positions": [v for i in sample for v in section_data.GetPoint(i)],
            "values": [v for i in sample for v in vectors.GetTuple(i)],
            "fields": values(section_data, sample),
        },
        "fields": [{"id": n, "label": label, "unit": unit} for n, label, unit in fields],
    }
    for field in payload["fields"]:
        all_values = [
            v
            for layer in ("surface", "slice", "streamlines")
            for v in payload[layer]["fields"].get(field["id"], [])
        ]
        field["range"] = [min(all_values), max(all_values)]
    output.write_text(json.dumps(payload, allow_nan=False, separators=(",", ":")))


if __name__ == "__main__":
    extract(Path(sys.argv[1]), Path(sys.argv[2]), float(sys.argv[3]))
