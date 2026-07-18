#!/bin/sh

set -eu

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
FAKE_ROOT=$(mktemp -d)
trap 'rm -rf "$FAKE_ROOT"' EXIT

APP_ID=io.github.nenad.webos25menu
APP_DIR="$FAKE_ROOT/media/developer/apps/usr/palm/applications/$APP_ID"
INIT_DIR="$FAKE_ROOT/var/lib/webosbrew/init.d"

mkdir -p "$APP_DIR" "$INIT_DIR" "$FAKE_ROOT/etc" "$FAKE_ROOT/proc/bus/input" "$FAKE_ROOT/usr/bin"
cp -R "$PROJECT_ROOT/app/root" "$APP_DIR/root"
printf '%s\n' 'Rockhopper release 10.3.1-3001 (test)' > "$FAKE_ROOT/etc/starfish-release"
printf '%s\n' \
  'N: Name="LGE M-RCU - Builtin [0]"' \
  '' \
  'N: Name="LGE M-RCU - Builtin [2]"' > "$FAKE_ROOT/proc/bus/input/devices"
ln -s "$(command -v python3)" "$FAKE_ROOT/usr/bin/python3"

TEST_APP_DIR="$FAKE_ROOT/usr/palm/applications/com.test.visible"
mkdir -p "$TEST_APP_DIR"
printf '%s\n' \
  '{"id":"com.test.visible","title":"Visible Test App","visible":true,"icon":"icon.png"}' \
  > "$TEST_APP_DIR/appinfo.json"
: > "$TEST_APP_DIR/icon.png"

: > "$INIT_DIR/inputhook"
: > "$INIT_DIR/start_magic_mapper"
chmod 0755 "$INIT_DIR/inputhook" "$INIT_DIR/start_magic_mapper"

run_installer() {
  WEBOS25MENU_ROOT_PREFIX="$FAKE_ROOT" \
    WEBOS25MENU_TEST_MODE=1 \
    sh "$APP_DIR/root/install.sh" "$1"
}

assert_json() {
  output=$1
  expression=$2
  printf '%s' "$output" | python3 -c \
    'import json,sys; value=json.load(sys.stdin); assert eval(sys.argv[1], {}, {"value": value}), value' \
    "$expression"
}

status=$(run_installer status)
assert_json "$status" 'value["root"] and value["compatible"] and value["conflict"]'

apps=$(run_installer list-apps)
assert_json "$apps" 'len(value["launchPoints"]) == 1 and value["launchPoints"][0]["id"] == "com.test.visible"'

refused=$(run_installer install)
assert_json "$refused" 'not value["ok"]'
[ -x "$INIT_DIR/inputhook" ]
[ -x "$INIT_DIR/start_magic_mapper" ]

enabled=$(run_installer install-force)
assert_json "$enabled" 'value["ok"]'
[ -x "$INIT_DIR/webos25menu" ]
[ ! -x "$INIT_DIR/inputhook" ]
[ ! -x "$INIT_DIR/start_magic_mapper" ]
[ -f "$FAKE_ROOT/home/root/.config/webos25menu/state/test-running" ]

enabled_again=$(run_installer install)
assert_json "$enabled_again" 'value["ok"]'

disabled=$(run_installer uninstall)
assert_json "$disabled" 'value["ok"]'
[ ! -e "$INIT_DIR/webos25menu" ]
[ -x "$INIT_DIR/inputhook" ]
[ -x "$INIT_DIR/start_magic_mapper" ]
[ ! -e "$FAKE_ROOT/home/root/.config/webos25menu" ]
