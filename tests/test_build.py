from __future__ import annotations

import hashlib
import io
import json
import tarfile
import tempfile
import unittest
from pathlib import Path

from tools.build_ipk import APP_ROOT, build


def read_ar(path: Path) -> dict[str, bytes]:
    data = path.read_bytes()
    if not data.startswith(b"!<arch>\n"):
        raise AssertionError("Missing ar signature")

    members: dict[str, bytes] = {}
    offset = 8
    while offset < len(data):
        header = data[offset:offset + 60]
        if len(header) != 60 or header[58:60] != b"`\n":
            raise AssertionError("Invalid ar member header")
        name = header[:16].decode("ascii").strip().rstrip("/")
        size = int(header[48:58].decode("ascii").strip())
        start = offset + 60
        members[name] = data[start:start + size]
        offset = start + size + (size % 2)
    return members


class PackageBuildTest(unittest.TestCase):
    def test_package_is_deterministic_and_complete(self) -> None:
        appinfo = json.loads((APP_ROOT / "appinfo.json").read_text())
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / "first.ipk"
            second = Path(directory) / "second.ipk"
            build(first)
            build(second)

            self.assertEqual(
                hashlib.sha256(first.read_bytes()).digest(),
                hashlib.sha256(second.read_bytes()).digest(),
            )

            members = read_ar(first)
            self.assertEqual(
                list(members),
                ["debian-binary", "control.tar.gz", "data.tar.gz"],
            )
            self.assertEqual(members["debian-binary"], b"2.0\n")

            with tarfile.open(fileobj=io.BytesIO(members["data.tar.gz"]), mode="r:gz") as archive:
                names = archive.getnames()
                prefix = f"./usr/palm/applications/{appinfo['id']}"
                self.assertIn(f"{prefix}/appinfo.json", names)
                self.assertIn(f"{prefix}/root/install.sh", names)
                self.assertIn(f"{prefix}/assets/icon.png", names)
                self.assertFalse(any("__pycache__" in name or name.endswith(".pyc") for name in names))


if __name__ == "__main__":
    unittest.main()
