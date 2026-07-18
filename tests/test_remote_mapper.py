from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


MAPPER_PATH = Path(__file__).resolve().parents[1] / "app" / "root" / "remote_mapper.py"
SPEC = importlib.util.spec_from_file_location("remote_mapper", MAPPER_PATH)
assert SPEC and SPEC.loader
remote_mapper = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(remote_mapper)


class ForegroundTransitionTest(unittest.TestCase):
    def test_app_exit_to_stock_home_returns_to_custom_home(self) -> None:
        self.assertTrue(
            remote_mapper.should_return_to_custom_home(
                "com.example.video",
                "com.webos.app.home",
                "io.github.nenad.webos25menu",
                "com.webos.app.home",
                100.0,
                90.0,
            )
        )

    def test_explicit_stock_home_grace_prevents_redirect(self) -> None:
        self.assertFalse(
            remote_mapper.should_return_to_custom_home(
                "com.example.video",
                "com.webos.app.home",
                "io.github.nenad.webos25menu",
                "com.webos.app.home",
                100.0,
                120.0,
            )
        )

    def test_custom_to_stock_transition_is_not_treated_as_app_exit(self) -> None:
        self.assertFalse(
            remote_mapper.should_return_to_custom_home(
                "io.github.nenad.webos25menu",
                "com.webos.app.home",
                "io.github.nenad.webos25menu",
                "com.webos.app.home",
                100.0,
                0.0,
            )
        )


if __name__ == "__main__":
    unittest.main()
