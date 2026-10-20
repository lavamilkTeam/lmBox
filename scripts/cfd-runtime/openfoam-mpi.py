#!/usr/bin/env python3
"""Build the pinned private Open MPI SDK used by the OpenFOAM build CLI."""

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import shutil
import signal
import subprocess
import tarfile
import tempfile
import urllib.request


ROOT = Path(__file__).resolve().parents[2]
VERSION = "4.1.8"
ARCHIVE_NAME = f"openmpi-{VERSION}.tar.bz2"
URL = f"https://download.open-mpi.org/release/open-mpi/v4.1/{ARCHIVE_NAME}"
SHA256 = "466f68e3132a1dc02710cc2011fafced8336d98359fa2dae4dddcfd5719f12a9"
DEPLOYMENT_TARGET = "13.0"
SOURCE = ROOT / f".tools/cfd/deps/openmpi-{VERSION}"
BUILD = ROOT / f".tools/cfd/deps/openmpi-{VERSION}-build"
SDK = ROOT / f".tools/cfd/deps/openmpi-{VERSION}-sdk"
ARCHIVE = ROOT / ".tools/cfd/downloads" / ARCHIVE_NAME
OPTIONS = (
    "--enable-shared",
    "--disable-static",
    "--disable-dlopen",
    "--disable-mpi-fortran",
    "--disable-mpi-cxx",
    "--disable-mpi-java",
    "--disable-oshmem",
    "--disable-oshmem-fortran",
    "--disable-debug",
    "--disable-wrapper-rpath",
    "--disable-wrapper-runpath",
    "--with-hwloc=internal",
    "--with-libevent=internal",
    "--with-pmix=internal",
    "--disable-hwloc-pci",
    "--without-verbs",
    "--without-ucx",
    "--without-ofi",
    "--without-psm",
    "--without-psm2",
    "--without-cuda",
    "--without-x",
)
# Build only the three runtime projects, excluding the top-level test subtree.
PROJECTS = ("opal", "orte", "ompi")
NO_MANUALS = ("man_MANS=", "nodist_man_MANS=", "dist_man_MANS=")
MAGIC = (b"\xcf\xfa\xed\xfe", b"\xfe\xed\xfa\xcf")
HELLO = r"""
#include <mpi.h>
#include <stdio.h>
int main(int argc, char **argv) {
    int provided, rank, size, value, sum, received;
    if (MPI_Init_thread(&argc, &argv, MPI_THREAD_MULTIPLE, &provided)) return 1;
    MPI_Comm_rank(MPI_COMM_WORLD, &rank);
    MPI_Comm_size(MPI_COMM_WORLD, &size);
    if (size != 2 || provided < MPI_THREAD_MULTIPLE) MPI_Abort(MPI_COMM_WORLD, 2);
    value = rank + 1;
    MPI_Allreduce(&value, &sum, 1, MPI_INT, MPI_SUM, MPI_COMM_WORLD);
    MPI_Sendrecv(&rank, 1, MPI_INT, 1-rank, 7, &received, 1, MPI_INT,
                 1-rank, 7, MPI_COMM_WORLD, MPI_STATUS_IGNORE);
    if (sum != 3 || received != 1-rank) MPI_Abort(MPI_COMM_WORLD, 3);
    printf("{\"rank\":%d,\"size\":%d,\"sum\":%d,\"peer\":%d,\"threadLevel\":%d}\n",
           rank, size, sum, received, provided);
    MPI_Finalize();
    return 0;
}
"""


def environment(prefix=None):
    """Use only the platform toolchain and explicitly selected private SDK."""
    env = {
        "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
        "HOME": os.environ["HOME"],
        "TMPDIR": tempfile.gettempdir(),
        "LC_ALL": "C",
        "CC": "/usr/bin/clang",
        "CXX": "/usr/bin/clang++",
        "CFLAGS": "-O2 -arch arm64",
        "CXXFLAGS": "-O2 -arch arm64",
        "LDFLAGS": "-arch arm64",
        "PKG_CONFIG": "/usr/bin/false",
        "MACOSX_DEPLOYMENT_TARGET": DEPLOYMENT_TARGET,
    }
    if prefix is not None:
        env["OPAL_PREFIX"] = str(prefix)
        env["PATH"] = str(prefix / "bin") + ":" + env["PATH"]
    return env


def run(arguments, name, cwd=None, env=None, timeout=None):
    logs = BUILD / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    print(f"[Open MPI] {name}", flush=True)
    with (logs / f"{name}.log").open("w") as output:
        process = subprocess.Popen(
            [str(argument) for argument in arguments],
            cwd=cwd,
            env=environment() if env is None else env,
            stdout=output,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        try:
            returncode = process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
            raise RuntimeError(f"{name} timed out") from None
    if returncode:
        tail = (logs / f"{name}.log").read_text(errors="replace").splitlines()[-30:]
        raise RuntimeError(f"{name} failed ({returncode}):\n" + "\n".join(tail))
    return (logs / f"{name}.log").read_text(errors="replace")


def prepare():
    if not ARCHIVE.exists():
        ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
        temporary = ARCHIVE.with_suffix(".partial")
        try:
            with urllib.request.urlopen(URL, timeout=120) as response:
                with temporary.open("wb") as output:
                    shutil.copyfileobj(response, output)
            if hashlib.sha256(temporary.read_bytes()).hexdigest() != SHA256:
                raise ValueError("Downloaded Open MPI archive SHA-256 mismatch")
            temporary.replace(ARCHIVE)
        finally:
            temporary.unlink(missing_ok=True)
    if hashlib.sha256(ARCHIVE.read_bytes()).hexdigest() != SHA256:
        raise ValueError("Cached Open MPI archive SHA-256 mismatch")
    with tarfile.open(ARCHIVE) as archive:
        members = archive.getmembers()
        for member in members:
            path = PurePosixPath(member.name)
            if (
                path.is_absolute()
                or ".." in path.parts
                or not path.parts
                or path.parts[0] != SOURCE.name
                or not (member.isdir() or member.isfile() or member.issym())
            ):
                raise ValueError("Unsafe Open MPI archive member")
            if member.issym():
                target = (SOURCE.parent / member.name).parent / member.linkname
                if SOURCE.resolve() not in target.resolve().parents:
                    raise ValueError("Open MPI source link escapes the source tree")
        if not SOURCE.exists():
            archive.extractall(SOURCE.parent)
        # An existing source tree must still match the verified archive.
        expected = {
            str(PurePosixPath(member.name).relative_to(SOURCE.name))
            for member in members
        } - {"."}
        actual = {path.relative_to(SOURCE).as_posix() for path in SOURCE.rglob("*")}
        if expected != actual:
            raise ValueError("Open MPI source has missing or unexpected paths")
        for member in members:
            target = SOURCE.parent / member.name
            if member.isfile():
                with archive.extractfile(member) as incoming:
                    if target.is_symlink() or target.read_bytes() != incoming.read():
                        raise ValueError(f"Modified Open MPI source: {member.name}")
            elif member.issym() and (
                not target.is_symlink()
                or target.readlink().as_posix() != member.linkname
            ):
                raise ValueError(f"Modified Open MPI source link: {member.name}")


def configure():
    prepare()
    receipt_path = BUILD / "lmbox-configuration.json"
    if (
        receipt_path.exists()
        and json.loads(receipt_path.read_text()) != configuration()
    ):
        print(
            "[Open MPI] clearing objects built with a different configuration",
            flush=True,
        )
        shutil.rmtree(BUILD)
    BUILD.mkdir(parents=True, exist_ok=True)
    run(
        [SOURCE / "configure", f"--prefix={SDK}", *OPTIONS],
        "configure",
        cwd=BUILD,
    )
    receipt_path.write_text(json.dumps(configuration(), indent=2) + "\n")


def configuration():
    return {
        "archiveSha256": SHA256,
        "options": list(OPTIONS),
        "deploymentTarget": DEPLOYMENT_TARGET,
    }


def configured():
    receipt = json.loads((BUILD / "lmbox-configuration.json").read_text())
    if receipt != configuration():
        raise ValueError("MPI configuration changed; run configure before building")


def build(jobs):
    configured()
    for project in PROJECTS:
        run(
            ["/usr/bin/make", f"-j{jobs}", *NO_MANUALS, "all"],
            f"build-{project}",
            cwd=BUILD / project,
        )


def relocate():
    """Make SDK binaries self-contained; OPAL_PREFIX relocates support data."""
    binaries = []
    for path in SDK.rglob("*"):
        if path.is_file() and not path.is_symlink():
            with path.open("rb") as stream:
                if stream.read(4) in MAGIC:
                    binaries.append(path)
    for binary in binaries:
        output = subprocess.check_output(
            ["/usr/bin/otool", "-l", str(binary)], text=True
        )
        changes = []
        lines = output.splitlines()
        command = None
        for line in lines:
            value = line.strip()
            if value.startswith("cmd "):
                command = value[4:]
            elif command == "LC_RPATH" and value.startswith("path "):
                changes += ["-delete_rpath", value[5:].split(" (offset", 1)[0]]
            elif command == "LC_ID_DYLIB" and value.startswith("name "):
                changes += ["-id", "@rpath/" + binary.name]
            elif command in (
                "LC_LOAD_DYLIB",
                "LC_LOAD_WEAK_DYLIB",
                "LC_REEXPORT_DYLIB",
                "LC_LOAD_UPWARD_DYLIB",
            ) and value.startswith("name "):
                dependency = value[5:].split(" (offset", 1)[0]
                if dependency.startswith(("/usr/lib/", "/System/Library/")):
                    continue
                if dependency.startswith("@loader_path/"):
                    target = binary.parent / dependency[len("@loader_path/") :]
                else:
                    target = Path(dependency)
                target = target.resolve()
                if SDK.resolve() not in target.parents or not target.is_file():
                    raise ValueError(f"External MPI dependency: {dependency}")
                relative = os.path.relpath(target, binary.parent)
                changes += ["-change", dependency, "@loader_path/" + relative]
        if changes:
            subprocess.run(
                ["/usr/bin/install_name_tool", *changes, str(binary)], check=True
            )
        subprocess.run(
            ["/usr/bin/codesign", "--force", "--sign", "-", str(binary)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    return len(binaries)


def install(jobs):
    configured()
    for project in PROJECTS:
        run(
            ["/usr/bin/make", f"-j{jobs}", *NO_MANUALS, "install"],
            f"install-{project}",
            cwd=BUILD / project,
        )
    licenses = SDK / "share/licenses/openmpi"
    licenses.mkdir(parents=True, exist_ok=True)
    for relative, name in (
        ("LICENSE", "LICENSE"),
        ("opal/mca/hwloc/hwloc201/hwloc/COPYING", "hwloc-COPYING"),
        ("opal/mca/pmix/pmix3x/pmix/LICENSE", "pmix-LICENSE"),
        ("opal/mca/event/libevent2022/libevent/LICENSE", "libevent-LICENSE"),
    ):
        shutil.copy2(SOURCE / relative, licenses / name)
    binaries = relocate()
    manifest = {
        "schema": "lmbox.openmpi-sdk.v1",
        "target": "darwin-arm64",
        "source": {
            "name": "Open MPI",
            "version": VERSION,
            "url": URL,
            "sha256": SHA256,
            "verification": "https://www.open-mpi.org/software/ompi/v4.1/",
        },
        "build": {
            "sourceBuilt": True,
            "compiler": run(["/usr/bin/clang", "--version"], "compiler").splitlines()[
                0
            ],
            "compilerFlags": "-O2 -arch arm64",
            "linkerFlags": "-arch arm64",
            "deploymentTarget": DEPLOYMENT_TARGET,
            "options": list(OPTIONS),
            "projects": list(PROJECTS),
            "testsBuilt": False,
            "manualsInstalled": False,
            "mcaPlugins": "built into shared libraries; dlopen disabled",
            "machOFiles": binaries,
        },
        "runtime": {
            "environment": {"OPAL_PREFIX": "<runtime MPI directory>"},
            "supportDirectories": ["etc", "share/openmpi", "share/pmix"],
            "executables": ["bin/mpiexec", "bin/orted"],
            "buildWrappers": ["bin/mpicc", "bin/mpicxx"],
        },
        "smoke": {"status": "not-run"},
    }
    (SDK / "lmbox-mpi.json").write_text(json.dumps(manifest, indent=2) + "\n")


def smoke():
    manifest_path = SDK / "lmbox-mpi.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["smoke"] = {"status": "not-run"}
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    # Test support-directory lookup and dynamic loading after a real directory move.
    # Darwin's Unix socket paths have a small limit; user TMPDIR can be long.
    with tempfile.TemporaryDirectory(
        prefix="lmbox-mpi-", dir="/private/tmp"
    ) as temporary:
        directory = Path(temporary)
        moved = directory / "mpi"
        shutil.copytree(SDK, moved, symlinks=True)
        env = environment(moved)
        env["HOME"] = str(directory)
        env["TMPDIR"] = str(directory)
        source = directory / "hello.c"
        source.write_text(HELLO)
        binary = directory / "hello"
        # Test executables resolve libmpi in the moved SDK at link time.
        rpath = "-Wl,-rpath," + str(moved / "lib")
        run(
            [moved / "bin/mpicc", source, rpath, "-o", binary],
            "smoke-compile-c",
            env=env,
        )
        run(
            [
                moved / "bin/mpicxx",
                "-x",
                "c++",
                source,
                rpath,
                "-o",
                directory / "hello-cxx",
            ],
            "smoke-compile-cxx",
            env=env,
        )
        output = run(
            [moved / "bin/mpiexec", "--oversubscribe", "-n", "2", binary],
            "smoke-two-processes",
            env=env,
            timeout=60,
        )
        records = [
            json.loads(line) for line in output.splitlines() if line.startswith("{")
        ]
        if sorted(record["rank"] for record in records) != [0, 1] or any(
            record["size"] != 2
            or record["sum"] != 3
            or record["peer"] != 1 - record["rank"]
            for record in records
        ):
            raise RuntimeError(
                "The real MPI communication check did not report both ranks"
            )
        manifest["smoke"] = {
            "status": "passed",
            "checks": [
                "relocated SDK with isolated Python/Qt/DYLD paths",
                "C and C++ compiler wrappers",
                "two MPI ranks",
                "MPI_THREAD_MULTIPLE",
                "MPI_Allreduce",
                "MPI_Sendrecv",
            ],
            "ranks": sorted(records, key=lambda record: record["rank"]),
        }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest["smoke"], indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command",
        choices=("prepare", "configure", "build", "install", "smoke", "all"),
        nargs="?",
        default="all",
    )
    parser.add_argument("--jobs", type=int, choices=(1, 2), default=2)
    arguments = parser.parse_args()
    if platform.system() != "Darwin" or platform.machine() != "arm64":
        parser.error("This SDK build currently supports macOS arm64 only")
    if arguments.command == "prepare":
        prepare()
    if arguments.command in ("configure", "all"):
        configure()
    if arguments.command in ("build", "all"):
        build(arguments.jobs)
    if arguments.command in ("install", "all"):
        install(arguments.jobs)
    if arguments.command in ("smoke", "all"):
        smoke()


if __name__ == "__main__":
    main()
