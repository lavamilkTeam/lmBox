"""Run a real cavity calculation against a supplied OpenFOAM prefix."""

import argparse
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[2]


def run(prefix, case, command, *arguments, mplib="OPENMPI-4.1.8", label=None):
    user = prefix / ".lmbox-user" if (prefix / ".lmbox-build-source.json").exists() else case / "user"
    isolated_home = case / "isolated-home"
    isolated_home.mkdir(exist_ok=True)
    clean_environment = {
        "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
        "HOME": str(isolated_home),
        "TMPDIR": "/private/tmp",
        "LANG": "C",
        "LC_ALL": "C",
    }
    script = """
runtime_prefix="$1"
export FOAM_CONFIG_MODE=o LMBOX_OPENFOAM_USER_DIR="$2"
. "$1/etc/bashrc" WM_COMPILER=Clang WM_MPLIB="$3" WM_PROJECT_USER_DIR="$2"
export FOAM_SIGFPE=false OMP_NUM_THREADS=2
shift 3
runtime_command=$(command -v "$1") || exit 127
case "$runtime_command" in
    "$runtime_prefix"/*) ;;
    *) echo "Command resolved outside the runtime prefix: $1" >&2; exit 126 ;;
esac
shift
exec "$runtime_command" "$@"
"""
    path = case / ("log." + (label or command))
    with path.open("w") as log:
        result = subprocess.run(
            ["/bin/bash", "--noprofile", "--norc", "-c", script,
             "lmbox-openfoam-smoke", str(prefix), str(user), mplib, command, *arguments],
            cwd=case, env=clean_environment, stdout=log, stderr=subprocess.STDOUT,
        )
    if result.returncode:
        raise RuntimeError(f"{command} failed: {path.read_text()[-6000:]}")
    return path.read_text()


def cavity(prefix, output, parallel=0, mplib="OPENMPI-4.1.8"):
    output.mkdir(parents=True, exist_ok=True)
    case = Path(tempfile.mkdtemp(prefix="cavity-", dir=output))
    tutorial = ROOT / "runtime/openfoam/source/tutorials/incompressible/icoFoam/cavity/cavity"
    for name in ("0", "constant", "system"):
        shutil.copytree(tutorial / name, case / name)
    for command in ("blockMesh", "checkMesh"):
        run(prefix, case, command, "-case", str(case), mplib=mplib)
    commands = ["blockMesh", "checkMesh", "icoFoam"]
    if parallel:
        (case / "system/decomposeParDict").write_text(
            'FoamFile { version 2.0; format ascii; class dictionary; object decomposeParDict; }\n'
            f'numberOfSubdomains {parallel};\nmethod scotch;\n'
        )
        run(prefix, case, "decomposePar", "-case", str(case), mplib=mplib)
        run(prefix, case, "mpiexec", "--oversubscribe", "-np", str(parallel),
            "icoFoam", "-parallel", "-case", str(case), mplib=mplib, label="icoFoam")
        run(prefix, case, "reconstructPar", "-case", str(case), "-latestTime", mplib=mplib)
        commands += ["decomposePar", "mpiexec", "reconstructPar"]
    else:
        run(prefix, case, "icoFoam", "-case", str(case), mplib=mplib)
    if "Mesh OK." not in (case / "log.checkMesh").read_text():
        raise RuntimeError("checkMesh did not confirm mesh validity")
    velocity = (case / "0.5/U").read_text()
    match = re.search(r"internalField\s+nonuniform\s+List<vector>\s+(\d+)\s*\((.*?)\n\)", velocity, re.S)
    if not match or int(match.group(1)) != 400:
        raise RuntimeError("The solver did not write the expected 400-cell velocity field")
    vectors = [tuple(float(value) for value in vector.split())
               for vector in re.findall(r"\(([^)]+)\)", match.group(2))]
    if len(vectors) != 400 or any(len(vector) != 3 for vector in vectors):
        raise RuntimeError("Unexpected velocity field structure")
    if not all(math.isfinite(value) for vector in vectors for value in vector):
        raise RuntimeError("The calculated velocity contains non-finite values")
    speed = max(math.sqrt(sum(value * value for value in vector)) for vector in vectors)
    if not 0 < speed < 2:
        raise RuntimeError(f"Unexpected cavity velocity magnitude: {speed}")
    if not (case / "0.5/p").is_file():
        raise RuntimeError("The pressure result is missing")
    report = {
        "status": "passed",
        "case": "OpenFOAM-v2306 icoFoam/cavity",
        "cells": 400,
        "endTime": 0.5,
        "meshCheck": "Mesh OK.",
        "maximumVelocity": speed,
        "processes": parallel or 1,
        "commands": commands,
    }
    (output / "smoke.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return report


def cfmesh(prefix, output, mplib="OPENMPI-4.1.8", parallel=0):
    case = Path(tempfile.mkdtemp(prefix="cfmesh-", dir=output))
    for name in ("system", "constant"):
        (case / name).mkdir()
    for name, contents in (
        ("controlDict", "application cartesianMesh; startFrom startTime; startTime 0;\n"
         "stopAt endTime; endTime 1; deltaT 1; writeControl timeStep; writeInterval 1;\n"
         "writeFormat ascii; writePrecision 12; runTimeModifiable false;\n"),
        ("fvSchemes", "ddtSchemes {default steadyState;} gradSchemes {default Gauss linear;}\n"
         "divSchemes {default none;} laplacianSchemes {default Gauss linear corrected;}\n"
         "interpolationSchemes {default linear;} snGradSchemes {default corrected;}\n"),
        ("fvSolution", "solvers {}\n"),
    ):
        (case / "system" / name).write_text(
            f"FoamFile {{version 2.0; format ascii; class dictionary; object {name};}}\n" + contents
        )
    vertices = [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0),
                (0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
             (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    stl = ["solid cube"]
    for a, b, c, d in faces:
        for triangle in ((a, b, c), (a, c, d)):
            stl += ["facet normal 0 0 0", "outer loop"]
            stl += ["vertex " + " ".join(map(str, vertices[index])) for index in triangle]
            stl += ["endloop", "endfacet"]
    (case / "cube.stl").write_text("\n".join(stl + ["endsolid cube", ""]))
    run(prefix, case, "surfaceFeatureEdges", "cube.stl", "cube.fms", mplib=mplib)
    (case / "system/meshDict").write_text(
        'FoamFile { version 2.0; format ascii; class dictionary; object meshDict; }\n'
        'surfaceFile "cube.fms";\nmaxCellSize 0.25;\n'
        'renameBoundary { defaultName walls; defaultType wall; }\n'
    )
    commands = ["surfaceFeatureEdges", "cartesianMesh", "checkMesh"]
    if parallel:
        (case / "system/decomposeParDict").write_text(
            'FoamFile { version 2.0; format ascii; class dictionary; object decomposeParDict; }\n'
            f'numberOfSubdomains {parallel};\nmethod scotch;\n'
        )
        run(prefix, case, "preparePar", "-case", str(case), mplib=mplib)
        run(prefix, case, "mpiexec", "--oversubscribe", "-np", str(parallel),
            "cartesianMesh", "-parallel", "-case", str(case), mplib=mplib, label="cartesianMesh")
        run(prefix, case, "reconstructParMesh", "-case", str(case),
            "-constant", "-fullMatch", mplib=mplib)
        commands += ["preparePar", "mpiexec", "reconstructParMesh"]
    else:
        run(prefix, case, "cartesianMesh", "-case", str(case), mplib=mplib)
    checked = run(prefix, case, "checkMesh", "-case", str(case), mplib=mplib)
    if "Mesh OK." not in checked or not (case / "constant/polyMesh/points").exists():
        raise RuntimeError("cfMesh cube mesh failed verification")
    match = re.search(r"^\s*cells:\s*(\d+)", checked, re.M)
    if not match or int(match.group(1)) < 1:
        raise RuntimeError("cfMesh produced no cells")
    return {"status": "passed", "case": "cfMesh closed cube", "cells": int(match.group(1)),
            "processes": parallel or 1, "commands": commands}


def hisa(prefix, output, mplib="OPENMPI-4.1.8"):
    case = Path(tempfile.mkdtemp(prefix="hisa-", dir=output))
    template = ROOT / "runtime/cfdof/Data/TestFiles/cases/Projectile/case"
    for name in ("system", "constant", "0"):
        (case / name).mkdir()
    for name in ("fvSchemes", "fvSolution"):
        shutil.copy2(template / "system" / name, case / "system" / name)
    shutil.copy2(template / "constant/thermophysicalProperties",
                 case / "constant/thermophysicalProperties")
    (case / "constant/turbulenceProperties").write_text(
        'FoamFile { version 2.0; format ascii; class dictionary; object turbulenceProperties; }\n'
        'simulationType laminar;\n'
    )
    cavity_source = ROOT / "runtime/openfoam/source/tutorials/incompressible/icoFoam/cavity/cavity"
    shutil.copy2(cavity_source / "system/blockMeshDict", case / "system/blockMeshDict")
    (case / "system/controlDict").write_text(
        'FoamFile { version 2.0; format ascii; class dictionary; object controlDict; }\n'
        'application hisa; startFrom startTime; startTime 0; stopAt endTime;\n'
        'endTime 3; deltaT 1; writeControl timeStep; writeInterval 1;\n'
        'writeFormat ascii; writePrecision 12; runTimeModifiable false;\n'
    )
    for name, cls, dimensions, value, kind in (
        ("U", "volVectorField", "[0 1 -1 0 0 0 0]", "(0.1 0 0)", "fixedValue"),
        ("p", "volScalarField", "[1 -1 -2 0 0 0 0]", "101325", "zeroGradient"),
        ("T", "volScalarField", "[0 0 0 1 0 0 0]", "300", "zeroGradient"),
    ):
        (case / "0" / name).write_text(
            f'FoamFile {{ version 2.0; format ascii; class {cls}; object {name}; }}\n'
            f'dimensions {dimensions}; internalField uniform {value};\n'
            f'boundaryField {{ "(movingWall|fixedWalls)" {{ type {kind}; value uniform {value}; }}\n'
            'frontAndBack { type empty; } }\n'
        )
    run(prefix, case, "blockMesh", "-case", str(case), mplib=mplib)
    calculated = run(prefix, case, "hisa", "-case", str(case), mplib=mplib)
    if "End" not in calculated or "Pseudo" not in calculated and "pseudo" not in calculated:
        raise RuntimeError("HiSA did not execute its solver iteration")
    times = sorted(path for path in case.iterdir()
                   if path.is_dir() and re.fullmatch(r"[1-9]\d*(?:\.\d+)?", path.name))
    if not times or not (times[-1] / "T").is_file() or not (times[-1] / "p").is_file():
        raise RuntimeError("HiSA did not write thermodynamic results")
    for name in ("T", "p", "U"):
        text = (times[-1] / name).read_text()
        if re.search(r"(?i)\b(?:nan|inf)\b", text):
            raise RuntimeError("HiSA wrote a non-finite result")
    return {"status": "passed", "case": "HiSA uniform perfect-gas flow",
            "endTime": times[-1].name, "commands": ["blockMesh", "hisa"]}


def activation_isolation(prefix, output):
    case = Path(tempfile.mkdtemp(prefix="activation-", dir=output))
    fake = case / "host-bin"
    fake.mkdir()
    for name in ("foamRun", "surfaceFeatures", "createNonConformalCouples"):
        path = fake / name
        path.write_text("#!/bin/sh\nexit 99\n")
        path.chmod(0o755)
    environment = dict(os.environ, PATH=str(fake) + ":/usr/bin:/bin:/usr/sbin:/sbin",
                       OMPI_MCA_btl="invalid-host-value", OPAL_PREFIX=str(fake),
                       LMBOX_OPENFOAM_USER_DIR=str(case / "user"))
    script = """
. "$1/etc/bashrc"
for command in foamRun surfaceFeatures createNonConformalCouples; do
    if command -v "$command" >/dev/null 2>&1; then
        echo "Host command leaked through runtime activation: $command" >&2
        exit 1
    fi
done
test "$OPAL_PREFIX" = "$WM_PROJECT_DIR/mpi" || exit 2
test -z "${OMPI_MCA_btl+x}" || exit 3
"""
    result = subprocess.run(["/bin/bash", "--noprofile", "--norc", "-c", script,
                             "lmbox-activation", str(prefix)], env=environment,
                            capture_output=True, text=True)
    (case / "log.activation").write_text(result.stdout + result.stderr)
    if result.returncode:
        raise RuntimeError("Runtime activation retained host tools or MPI settings: " + result.stderr)
    return {"status": "passed", "name": "activation rejects unrelated host OpenFOAM and MPI settings"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prefix", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=ROOT / ".tools/cfd/build/openfoam-smoke")
    parser.add_argument("--parallel", type=int, default=0)
    parser.add_argument("--mplib", default="OPENMPI-4.1.8")
    parser.add_argument("--extensions", action="store_true")
    args = parser.parse_args()
    prefix, output = args.prefix.resolve(), args.output.resolve()
    checks = [cavity(prefix, output, args.parallel, args.mplib)]
    if args.extensions:
        checks += [cfmesh(prefix, output, args.mplib, args.parallel), hisa(prefix, output, args.mplib)]
    (output / "smoke.json").write_text(json.dumps({"status": "passed", "checks": checks}, indent=2) + "\n")
