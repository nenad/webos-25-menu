#!/bin/sh

set -u

ACTION=${1:-status}
ROOT_PREFIX=${WEBOS25MENU_ROOT_PREFIX:-}
TEST_MODE=${WEBOS25MENU_TEST_MODE:-0}
APP_ID=io.github.nenad.webos25menu

root_path() {
  printf '%s%s' "$ROOT_PREFIX" "$1"
}

APP_DIR=$(root_path "/media/developer/apps/usr/palm/applications/$APP_ID")
PAYLOAD_DIR="$APP_DIR/root"
DATA_DIR=$(root_path "/home/root/.local/share/webos25menu")
CONFIG_DIR=$(root_path "/home/root/.config/webos25menu")
STATE_DIR="$CONFIG_DIR/state"
INIT_DIR=$(root_path "/var/lib/webosbrew/init.d")
INIT_SCRIPT="$INIT_DIR/webos25menu"
INPUTHOOK_INIT="$INIT_DIR/inputhook"
LEGACY_INIT="$INIT_DIR/start_magic_mapper"
STARFISH_RELEASE=$(root_path "/etc/starfish-release")
INPUT_DEVICES=$(root_path "/proc/bus/input/devices")
PYTHON3=$(root_path "/usr/bin/python3")

MAPPER_PATTERN='^/usr/bin/python3 -u /home/root/.local/share/webos25menu/remote_mapper.py$'
LEGACY_PATTERN='^(/usr/bin/)?python3 -u /home/root/magic_mapper.py$'

bool() {
  if "$@"; then printf 'true'; else printf 'false'; fi
}

is_root() {
  [ "$TEST_MODE" = "1" ] || [ "$(id -u)" = "0" ]
}

is_compatible_version() {
  [ -f "$STARFISH_RELEASE" ] || return 1
  version=$(awk '{print $3}' "$STARFISH_RELEASE" 2>/dev/null)
  case "$version" in
    10.*) return 0 ;;
    *) return 1 ;;
  esac
}

has_expected_devices() {
  [ -r "$INPUT_DEVICES" ] || return 1
  grep -Fq 'Name="LGE M-RCU - Builtin [0]"' "$INPUT_DEVICES" &&
    grep -Fq 'Name="LGE M-RCU - Builtin [2]"' "$INPUT_DEVICES"
}

is_running() {
  [ "$TEST_MODE" = "1" ] && [ -f "$STATE_DIR/test-running" ] && return 0
  pgrep -f "$MAPPER_PATTERN" >/dev/null 2>&1
}

has_conflict() {
  [ -x "$INPUTHOOK_INIT" ] || [ -x "$LEGACY_INIT" ]
}

json_status() {
  root_value=$(bool is_root)
  compatible_value=$(bool is_compatible_version)
  devices_value=$(bool has_expected_devices)
  installed_value=$(bool test -x "$INIT_SCRIPT")
  running_value=$(bool is_running)
  conflict_value=$(bool has_conflict)
  message="Ready"

  if [ "$root_value" != "true" ]; then
    message="Homebrew Channel is not elevated"
  elif [ "$compatible_value" != "true" ]; then
    message="Only webOS 25 release 10.x is supported"
  elif [ ! -x "$PYTHON3" ]; then
    message="Python 3 is required"
    compatible_value=false
  elif [ "$devices_value" != "true" ]; then
    message="Expected Magic Remote input devices were not found"
    compatible_value=false
  fi

  printf '{"ok":true,"root":%s,"compatible":%s,"devices":%s,"installed":%s,"running":%s,"conflict":%s,"message":"%s"}\n' \
    "$root_value" "$compatible_value" "$devices_value" "$installed_value" \
    "$running_value" "$conflict_value" "$message"
}

json_result() {
  ok_value=$1
  message=$2
  printf '{"ok":%s,"message":"%s"}\n' "$ok_value" "$message"
}

validate_install() {
  is_root || {
    json_result false "Root access is required"
    return 1
  }
  is_compatible_version || {
    json_result false "Unsupported webOS version; release 10.x is required"
    return 1
  }
  [ -x "$PYTHON3" ] || {
    json_result false "Python 3 is required"
    return 1
  }
  [ -d "$INIT_DIR" ] || {
    json_result false "Homebrew startup directory is unavailable"
    return 1
  }
  has_expected_devices || {
    json_result false "Expected Magic Remote input devices were not found"
    return 1
  }
  [ -f "$PAYLOAD_DIR/remote_mapper.py" ] &&
    [ -f "$PAYLOAD_DIR/config.json" ] &&
    [ -f "$PAYLOAD_DIR/start_mapper.sh" ] || {
      json_result false "The application installer payload is incomplete"
      return 1
    }
  return 0
}

stop_mapper() {
  if [ "$TEST_MODE" = "1" ]; then
    rm -f "$STATE_DIR/test-running"
    return
  fi
  pkill -f "$MAPPER_PATTERN" >/dev/null 2>&1 || true
}

stop_legacy_mapper() {
  [ "$TEST_MODE" = "1" ] && return
  pkill -f "$LEGACY_PATTERN" >/dev/null 2>&1 || true
}

disable_conflicts() {
  mkdir -p "$STATE_DIR"

  if [ -x "$INPUTHOOK_INIT" ]; then
    : > "$STATE_DIR/inputhook-was-executable"
    chmod 0644 "$INPUTHOOK_INIT"
  fi

  if [ -x "$LEGACY_INIT" ]; then
    : > "$STATE_DIR/legacy-mapper-was-executable"
    chmod 0644 "$LEGACY_INIT"
    stop_legacy_mapper
  fi
}

restore_conflicts() {
  if [ -f "$STATE_DIR/inputhook-was-executable" ] && [ -f "$INPUTHOOK_INIT" ]; then
    chmod 0755 "$INPUTHOOK_INIT"
  fi

  if [ -f "$STATE_DIR/legacy-mapper-was-executable" ] && [ -f "$LEGACY_INIT" ]; then
    chmod 0755 "$LEGACY_INIT"
    if [ "$TEST_MODE" != "1" ]; then
      "$LEGACY_INIT" >/dev/null 2>&1 || true
    fi
  fi
}

start_mapper() {
  if [ "$TEST_MODE" = "1" ]; then
    : > "$STATE_DIR/test-running"
    return 0
  fi
  "$INIT_SCRIPT"
  sleep 3
  is_running
}

install_mapper() {
  force=$1
  validate_install || return 0

  if has_conflict && [ "$force" != "true" ]; then
    json_result false "A conflicting remote mapper is enabled; use the conflict-safe enable action"
    return 0
  fi

  mkdir -p "$DATA_DIR" "$CONFIG_DIR" "$STATE_DIR"
  if [ "$force" = "true" ]; then
    disable_conflicts
  fi

  stop_mapper
  cp "$PAYLOAD_DIR/remote_mapper.py" "$DATA_DIR/remote_mapper.py"
  cp "$PAYLOAD_DIR/config.json" "$CONFIG_DIR/config.json"
  cp "$PAYLOAD_DIR/start_mapper.sh" "$INIT_SCRIPT"
  chmod 0755 "$DATA_DIR/remote_mapper.py" "$INIT_SCRIPT"
  chmod 0644 "$CONFIG_DIR/config.json"

  if start_mapper; then
    json_result true "Home button integration enabled"
  else
    stop_mapper
    rm -f "$INIT_SCRIPT"
    restore_conflicts
    json_result false "Mapper could not capture the remote input device; previous mappings were restored"
  fi
}

uninstall_mapper() {
  is_root || {
    json_result false "Root access is required"
    return 0
  }

  stop_mapper
  rm -f "$INIT_SCRIPT"
  restore_conflicts
  rm -rf "$DATA_DIR" "$CONFIG_DIR"
  json_result true "Home button integration disabled and previous mappings restored"
}

list_apps() {
  if [ "$TEST_MODE" = "1" ]; then
    "$PYTHON3" - "$ROOT_PREFIX" "$APP_ID" <<'PY'
import json
import sys
from pathlib import Path

prefix = Path(sys.argv[1])
current_app_id = sys.argv[2]
apps = []
for relative_root in (
    "usr/palm/applications",
    "media/cryptofs/apps/usr/palm/applications",
    "media/developer/apps/usr/palm/applications",
):
    root = prefix / relative_root
    if not root.is_dir():
        continue
    for appinfo_path in root.glob("*/appinfo.json"):
        info = json.loads(appinfo_path.read_text(encoding="utf-8"))
        if (
            info.get("id")
            and info["id"] != current_app_id
            and info.get("visible") is not False
            and info.get("hidden") is not True
        ):
            apps.append({
                "id": info["id"],
                "title": info.get("title") or info["id"],
                "icon": "",
                "iconColor": info.get("iconColor") or "#243247",
                "params": {},
            })
apps.sort(key=lambda app: (app["title"].casefold(), app["id"]))
print(json.dumps({"ok": True, "launchPoints": apps}, separators=(",", ":")))
PY
    return
  fi

  launch_points_file="/tmp/webos25menu-launchpoints-$$.json"
  /usr/bin/script -q -e -c \
    "/usr/bin/luna-send -a com.webos.app.home -n 1 luna://com.webos.service.homelaunchpoints/listLaunchPoints '{}'" \
    "$launch_points_file" >/dev/null

  "$PYTHON3" - "$launch_points_file" "$APP_ID" <<'PY'
import base64
import json
import mimetypes
import sys
from pathlib import Path

raw = Path(sys.argv[1]).read_text(encoding="utf-8")
json_start = raw.find('{"subscribed"')
if json_start < 0:
    raise ValueError("Stock Home launch-point response was not found")
response, _ = json.JSONDecoder().raw_decode(raw[json_start:])
current_app_id = sys.argv[2]
result = []

for info in response.get("launchPoints", []):
    app_id = info.get("id")
    if not app_id or app_id == current_app_id or info.get("hidden") is True:
        continue

    icon = (
        info.get("extraLargeIcon")
        or info.get("mediumLargeIcon")
        or info.get("largeIcon")
        or info.get("icon")
        or ""
    )
    icon_path = Path(icon[7:] if icon.startswith("file:") else icon)
    if icon.startswith("/") or icon.startswith("file:"):
        try:
            if icon_path.is_file() and icon_path.stat().st_size <= 262144:
                mime = mimetypes.guess_type(icon_path.name)[0] or "image/png"
                encoded = base64.b64encode(icon_path.read_bytes()).decode("ascii")
                icon = f"data:{mime};base64,{encoded}"
        except OSError:
            pass

    result.append({
        "id": app_id,
        "title": info.get("title") or info.get("appDescription") or app_id,
        "icon": icon,
        "iconColor": info.get("iconColor") or info.get("bgColor") or "#243247",
        "params": info.get("params") or {},
    })

print(json.dumps({"ok": True, "launchPoints": result}, separators=(",", ":")))
PY
  rm -f "$launch_points_file"
}

case "$ACTION" in
  status)
    json_status
    ;;
  install)
    install_mapper false
    ;;
  install-force)
    install_mapper true
    ;;
  uninstall)
    uninstall_mapper
    ;;
  list-apps)
    list_apps
    ;;
  *)
    json_result false "Unknown installer action"
    ;;
esac
