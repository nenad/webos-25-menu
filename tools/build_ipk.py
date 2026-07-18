#!/usr/bin/env python3
"""Build a deterministic webOS IPK without platform-specific ar/tar tools."""

from __future__ import annotations

import argparse
import gzip
import io
import json
import os
import tarfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = PROJECT_ROOT / "app"
DIST_ROOT = PROJECT_ROOT / "dist"
IGNORED_NAMES = {"__pycache__", ".DS_Store"}


def tar_info(name: str, mode: int, size: int = 0, directory: bool = False) -> tarfile.TarInfo:
    info = tarfile.TarInfo(name)
    info.mtime = 0
    info.uid = 0
    info.gid = 0
    info.uname = "root"
    info.gname = "root"
    info.mode = mode
    info.size = size
    if directory:
        info.type = tarfile.DIRTYPE
    return info


def gzip_tar(entries: list[tuple[str, bytes | None, int]]) -> bytes:
    compressed = io.BytesIO()
    with gzip.GzipFile(fileobj=compressed, mode="wb", filename="", mtime=0) as gzip_file:
        with tarfile.open(fileobj=gzip_file, mode="w", format=tarfile.GNU_FORMAT) as archive:
            for name, data, mode in entries:
                if data is None:
                    archive.addfile(tar_info(name, mode, directory=True))
                else:
                    archive.addfile(tar_info(name, mode, len(data)), io.BytesIO(data))
    return compressed.getvalue()


def app_entries(app_id: str) -> list[tuple[str, bytes | None, int]]:
    prefix = f"./usr/palm/applications/{app_id}"
    entries: list[tuple[str, bytes | None, int]] = []
    directories = {prefix}

    files = [
        path
        for path in APP_ROOT.rglob("*")
        if path.is_file()
        and not any(part in IGNORED_NAMES for part in path.parts)
        and path.suffix != ".pyc"
    ]

    for path in files:
        relative = path.relative_to(APP_ROOT)
        current = Path(prefix)
        for part in relative.parent.parts:
            current /= part
            directories.add(current.as_posix())

    for directory in sorted(directories):
        entries.append((directory, None, 0o755))

    for path in sorted(files):
        relative = path.relative_to(APP_ROOT).as_posix()
        executable = os.access(path, os.X_OK)
        entries.append((f"{prefix}/{relative}", path.read_bytes(), 0o755 if executable else 0o644))

    return entries


def control_entries(app_id: str, version: str) -> list[tuple[str, bytes | None, int]]:
    control = "\n".join(
        [
            f"Package: {app_id}",
            f"Version: {version}",
            "Section: misc",
            "Priority: optional",
            "Architecture: all",
            "Maintainer: Nenad",
            "Description: Minimal custom Home menu for rooted webOS 25 TVs.",
            "webOS-Package-Format-Version: 2",
            "",
        ]
    ).encode()
    return [("./control", control, 0o644)]


def ar_member(name: str, data: bytes) -> bytes:
    encoded_name = f"{name}/".encode("ascii").ljust(16, b" ")
    header = b"".join(
        [
            encoded_name,
            b"0".ljust(12, b" "),
            b"0".ljust(6, b" "),
            b"0".ljust(6, b" "),
            b"100644".ljust(8, b" "),
            str(len(data)).encode("ascii").ljust(10, b" "),
            b"`\n",
        ]
    )
    padding = b"\n" if len(data) % 2 else b""
    return header + data + padding


def build(output: Path | None = None) -> Path:
    appinfo = json.loads((APP_ROOT / "appinfo.json").read_text(encoding="utf-8"))
    app_id = appinfo["id"]
    version = appinfo["version"]
    output = output or DIST_ROOT / f"{app_id}_{version}_all.ipk"
    output.parent.mkdir(parents=True, exist_ok=True)

    control = gzip_tar(control_entries(app_id, version))
    data = gzip_tar(app_entries(app_id))
    archive = (
        b"!<arch>\n"
        + ar_member("debian-binary", b"2.0\n")
        + ar_member("control.tar.gz", control)
        + ar_member("data.tar.gz", data)
    )
    output.write_bytes(archive)
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    arguments = parser.parse_args()
    print(build(arguments.output))


if __name__ == "__main__":
    main()
