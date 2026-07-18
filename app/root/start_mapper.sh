#!/bin/sh

MAPPER=/home/root/.local/share/webos25menu/remote_mapper.py
CONFIG=/home/root/.config/webos25menu/config.json
LOG=/tmp/webos25menu-mapper.log
PATTERN='^/usr/bin/python3 -u /home/root/.local/share/webos25menu/remote_mapper.py$'

if pgrep -f "$PATTERN" >/dev/null 2>&1; then
  exit 0
fi

WEBOS25MENU_CONFIG="$CONFIG" \
  nohup /usr/bin/python3 -u "$MAPPER" > "$LOG" 2>&1 < /dev/null &
