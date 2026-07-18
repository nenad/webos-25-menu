#!/usr/bin/env python3
"""Minimal Magic Remote mapper for webOS 25 Menu.

Derived from Magic Mapper by Andy Fraley:
https://github.com/andrewfraley/magic_mapper
"""

from __future__ import annotations

import fcntl
import json
import os
import re
import struct
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any

EV_KEY = 1
EVIOCGRAB = 1074021776
INPUT_EVENT_FORMAT = "llHHi"
INPUT_EVENT_SIZE = struct.calcsize(INPUT_EVENT_FORMAT)
DEFAULT_CONFIG = "/home/root/.config/webos25menu/config.json"


def log(message: str) -> None:
    print(message, flush=True)


def load_config() -> dict[str, Any]:
    path = Path(os.environ.get("WEBOS25MENU_CONFIG", DEFAULT_CONFIG))
    with path.open(encoding="utf-8") as config_file:
        return json.load(config_file)


def resolve_input_device(device_name: str) -> str | None:
    try:
        data = Path("/proc/bus/input/devices").read_text(encoding="utf-8")
    except OSError as error:
        log(f"Could not read input devices: {error}")
        return None

    for block in re.split(r"\n\s*\n", data.strip()):
        name_match = re.search(r'^N:\s+Name="([^"]+)"', block, flags=re.MULTILINE)
        if not name_match or name_match.group(1) != device_name:
            continue
        handlers_match = re.search(r"^H:\s+Handlers=([^\n]+)", block, flags=re.MULTILINE)
        if not handlers_match:
            continue
        for handler in handlers_match.group(1).split():
            if handler.startswith("event") and handler[5:].isdigit():
                return f"/dev/input/{handler}"
    return None


def wait_for_input_device(device_name: str) -> str:
    while True:
        path = resolve_input_device(device_name)
        if path:
            return path
        log(f"Waiting for input device: {device_name}")
        time.sleep(2)


def luna_send(endpoint: str, payload: dict[str, Any]) -> dict[str, Any]:
    command = [
        "/usr/bin/luna-send",
        "-n",
        "1",
        endpoint,
        json.dumps(payload, separators=(",", ":")),
    ]
    output = subprocess.check_output(command, stderr=subprocess.STDOUT, timeout=8)
    decoded = output.decode("utf-8", errors="replace").strip()
    return json.loads(decoded) if decoded else {}


def launch_app(app_id: str) -> None:
    try:
        response = luna_send(
            "luna://com.webos.service.applicationmanager/launch",
            {"id": app_id},
        )
        if response.get("returnValue") is False:
            raise RuntimeError(response.get("errorText", "launch failed"))
        log(f"Launched {app_id}")
    except Exception as error:
        log(f"Could not launch {app_id}: {error}")


def foreground_app_id() -> str:
    try:
        response = luna_send(
            "luna://com.webos.applicationManager/getForegroundAppInfo",
            {},
        )
        return str(response.get("appId") or response.get("id") or "")
    except Exception as error:
        log(f"Could not query foreground app: {error}")
        return ""


def schedule_launch(app_id: str, delay: float) -> None:
    timer = threading.Timer(delay, launch_app, args=(app_id,))
    timer.daemon = True
    timer.start()


def should_return_to_custom_home(
    previous_app: str,
    current_app: str,
    custom_home: str,
    stock_home: str,
    now: float,
    stock_home_allowed_until: float,
) -> bool:
    return (
        current_app == stock_home
        and previous_app not in ("", custom_home, stock_home)
        and now >= stock_home_allowed_until
    )


def monitor_foreground_apps(
    custom_home: str,
    stock_home: str,
    state: dict[str, float],
    poll_seconds: float,
) -> None:
    previous_app = foreground_app_id()
    while True:
        time.sleep(poll_seconds)
        current_app = foreground_app_id()
        if not current_app:
            continue

        now = time.monotonic()
        if should_return_to_custom_home(
            previous_app,
            current_app,
            custom_home,
            stock_home,
            now,
            state["stock_home_allowed_until"],
        ):
            log(f"{previous_app} exited to stock Home; returning to custom Home")
            launch_app(custom_home)
            current_app = custom_home
        previous_app = current_app


def run_mapper(config: dict[str, Any]) -> None:
    custom_home = str(config["customHomeAppId"])
    stock_home = str(config["stockHomeAppId"])
    home_code = int(config["homeKeyCode"])
    back_code = int(config["backKeyCode"])
    long_press = float(config.get("longPressSeconds", 1.0))
    return_delay = float(config.get("returnHomeDelaySeconds", 0.8))
    foreground_poll = float(config.get("foregroundPollSeconds", 0.75))
    stock_home_grace = float(config.get("stockHomeGraceSeconds", 30.0))
    state = {"stock_home_allowed_until": 0.0}

    source_path = wait_for_input_device(str(config["sourceDeviceName"]))
    output_path = wait_for_input_device(str(config["outputDeviceName"]))
    log(f"Reading remote input from {source_path}")
    log(f"Forwarding unhandled input to {output_path}")

    source = open(source_path, "rb", buffering=0)
    output = os.open(output_path, os.O_WRONLY)
    fcntl.ioctl(source, EVIOCGRAB, 1)
    monitor = threading.Thread(
        target=monitor_foreground_apps,
        args=(custom_home, stock_home, state, foreground_poll),
        daemon=True,
    )
    monitor.start()

    home_pressed_at: float | None = None
    back_pressed_at: float | None = None
    block_back = False

    try:
        while True:
            event = source.read(INPUT_EVENT_SIZE)
            if len(event) != INPUT_EVENT_SIZE:
                raise RuntimeError("Remote input device closed")

            _, _, event_type, code, value = struct.unpack(INPUT_EVENT_FORMAT, event)
            now = time.monotonic()

            if event_type != EV_KEY:
                os.write(output, event)
                continue

            if code == home_code:
                if value == 1:
                    home_pressed_at = now
                elif value == 0:
                    held_for = now - home_pressed_at if home_pressed_at is not None else 0
                    target = stock_home if held_for >= long_press else custom_home
                    state["stock_home_allowed_until"] = (
                        now + stock_home_grace if target == stock_home else 0.0
                    )
                    log(
                        f"{'Long' if target == stock_home else 'Short'} Home press "
                        f"({held_for:.2f}s)"
                    )
                    launch_app(target)
                    home_pressed_at = None
                continue

            if code == back_code:
                if value == 1:
                    back_pressed_at = now
                    block_back = foreground_app_id() == custom_home

                if block_back:
                    if value == 0:
                        log("Blocked Back in custom Home")
                        back_pressed_at = None
                        block_back = False
                    continue

                os.write(output, event)
                if value == 0:
                    held_for = now - back_pressed_at if back_pressed_at is not None else 0
                    if held_for >= long_press:
                        log(f"Long Back press ({held_for:.2f}s); scheduling custom Home")
                        schedule_launch(custom_home, return_delay)
                    back_pressed_at = None
                continue

            os.write(output, event)
    finally:
        try:
            fcntl.ioctl(source, EVIOCGRAB, 0)
        finally:
            source.close()
            os.close(output)


def main() -> int:
    try:
        run_mapper(load_config())
        return 0
    except KeyboardInterrupt:
        return 0
    except Exception as error:
        log(f"Fatal mapper error: {error}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
