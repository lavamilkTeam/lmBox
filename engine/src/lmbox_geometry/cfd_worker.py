"""Thin command-line entry point; runtime paths are supplied by the Rust host."""

import argparse

from lmbox_geometry.modules.cfd import run_worker


def main():
    parser = argparse.ArgumentParser(description="Isolated CfdOF JSONL worker")
    parser.add_argument("--upstream", required=True)
    parser.add_argument("--session", required=True)
    parser.add_argument("--docker-image")
    parser.add_argument("--docker-executable", default="docker")
    parser.add_argument("--paraview-executable")
    parser.add_argument("--container-name")
    args = parser.parse_args()
    run_worker(
        args.upstream,
        args.session,
        args.docker_image,
        args.docker_executable,
        args.paraview_executable,
        args.container_name,
    )


if __name__ == "__main__":
    main()
