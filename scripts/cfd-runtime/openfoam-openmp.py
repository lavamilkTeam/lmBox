"""Build the pinned LLVM OpenMP dependency required by cfMesh."""

import json
from pathlib import Path
import shutil
import subprocess
from openfoam_sources import acquire, verify_or_extract


ROOT = Path(__file__).resolve().parents[2]
SOURCES = ROOT / ".tools/cfd/build/openfoam-dependency-sources"
BUILD = ROOT / ".tools/cfd/build/openfoam-openmp"
PREFIX = ROOT / ".tools/cfd/build/openfoam-dependencies/openmp"
ARCHIVES = {
    "openmp": ("openmp-20.1.8.src.tar.xz", "b21c04ee9cbe56e200c5d83823765a443ee6389bbc3f64154c96e94016e6cee9"),
    "cmake": ("llvm-cmake-20.1.8.src.tar.xz", "3319203cfd1172bbac50f06fa68e318af84dcb5d65353310c0586354069d6634"),
}


def main():
    for name, (filename, digest) in ARCHIVES.items():
        upstream_name = filename.removeprefix("llvm-")
        archive = acquire(
            filename,
            "https://github.com/llvm/llvm-project/releases/download/llvmorg-20.1.8/" + upstream_name,
            digest,
        )
        target = SOURCES / name
        verify_or_extract(archive, target)
    cmake = shutil.which("cmake")
    if not cmake:
        raise RuntimeError("CMake is required to build OpenMP")
    BUILD.mkdir(parents=True, exist_ok=True)
    log = ROOT / ".tools/cfd/build/openfoam-logs/openmp.log"
    with log.open("w") as output:
        for command in [
            [cmake, "-S", str(SOURCES / "openmp"), "-B", str(BUILD), "-G", "Ninja",
             "-DCMAKE_BUILD_TYPE=Release", "-DCMAKE_INSTALL_PREFIX=" + str(PREFIX),
             "-DCMAKE_OSX_DEPLOYMENT_TARGET=26.0",
             "-DCMAKE_OSX_ARCHITECTURES=arm64", "-DOPENMP_ENABLE_LIBOMPTARGET=OFF",
             "-DOPENMP_ENABLE_TOOLS=OFF", "-DLIBOMP_OMPT_SUPPORT=OFF",
             "-DLIBOMP_INSTALL_ALIASES=OFF"],
            [cmake, "--build", str(BUILD), "--parallel", "3"],
            [cmake, "--install", str(BUILD)],
        ]:
            subprocess.run(command, check=True, stdout=output, stderr=subprocess.STDOUT)
    (PREFIX / "source.json").write_text(json.dumps({
        "component": "llvm-openmp", "version": "20.1.8",
        "archives": {filename: digest for filename, digest in ARCHIVES.values()},
        "source": "https://github.com/llvm/llvm-project/releases/tag/llvmorg-20.1.8",
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
