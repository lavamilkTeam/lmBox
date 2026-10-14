"""ZIP adapter used by the Node distribution builder; preserve Unix links and modes."""
import json
import os
import stat
import sys
import zipfile
from pathlib import Path

source, output = map(Path, sys.argv[1:3])
size = 0
with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for directory, directories, files in os.walk(source, followlinks=False):
        for name in sorted(directories + files):
            path = Path(directory) / name
            relative = path.relative_to(source).as_posix()
            mode = path.lstat().st_mode
            if stat.S_ISLNK(mode):
                # Installed links must remain inside the same immutable package.
                try:
                    path.resolve(strict=True).relative_to(source.resolve())
                except (ValueError, FileNotFoundError, RuntimeError) as error:
                    raise ValueError(f"Unsafe package link: {relative}") from error
                data = os.readlink(path).encode()
                item = zipfile.ZipInfo(relative)
                item.create_system = 3
                item.external_attr = mode << 16
                archive.writestr(item, data)
                size += len(data)
            elif stat.S_ISREG(mode):
                archive.write(path, relative)
                size += path.stat().st_size
print(json.dumps({"unpackedSize": size}))
