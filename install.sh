#!/usr/bin/env bash

set -Eeuo pipefail

REPOSITORY=nenad/webos-25-menu
APP_ID=io.github.nenad.webos25menu
REMOTE_IPK=/tmp/webos25menu.ipk

usage() {
  cat <<'EOF'
Usage: install.sh <TV_IP_OR_HOSTNAME> [--autostart]

Downloads and installs the latest webOS 25 Menu release on a rooted LG TV.
Use --autostart to also open the menu shortly after every TV startup.
EOF
}

if [[ ${1:-} == "-h" || ${1:-} == "--help" ]]; then
  usage
  exit 0
fi

TV_IP=${1:-${TV_IP:-}}
if [[ -z "$TV_IP" || "$TV_IP" == -* ]]; then
  usage
  exit 2
fi
shift || true

AUTOSTART=false
for argument in "$@"; do
  case "$argument" in
    --autostart) AUTOSTART=true ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $argument" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ ! "$TV_IP" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Invalid TV address: $TV_IP" >&2
  exit 2
fi

for command in curl ssh scp; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command not found: $command" >&2
    exit 1
  fi
done

TARGET="root@$TV_IP"
TEMP_DIR=$(mktemp -d)
LOCAL_IPK="$TEMP_DIR/webos25menu.ipk"
UPLOADED=false

cleanup() {
  rm -rf "$TEMP_DIR"
  if [[ "$UPLOADED" == true ]]; then
    ssh "$TARGET" "rm -f '$REMOTE_IPK'" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "Finding the latest release..."
RELEASE_URL=$(curl -fsSL -o /dev/null -w '%{url_effective}' \
  "https://github.com/$REPOSITORY/releases/latest")
if [[ "$RELEASE_URL" != */tag/v* ]]; then
  echo "Could not determine the latest release from: $RELEASE_URL" >&2
  exit 1
fi
VERSION=${RELEASE_URL##*/v}
ASSET="${APP_ID}_${VERSION}_all.ipk"
DOWNLOAD_URL="https://github.com/$REPOSITORY/releases/download/v${VERSION}/${ASSET}"

echo "Downloading $ASSET..."
curl -fL "$DOWNLOAD_URL" -o "$LOCAL_IPK"

echo "Copying the package to $TV_IP..."
scp -O "$LOCAL_IPK" "$TARGET:$REMOTE_IPK"
UPLOADED=true

echo "Installing webOS 25 Menu $VERSION..."
INSTALL_OUTPUT=$(
  ssh -tt "$TARGET" \
    "timeout 60 luna-send -w 60000 -i luna://com.webos.appInstallService/dev/install '{\"id\":\"com.ares.defaultName\",\"ipkUrl\":\"$REMOTE_IPK\",\"subscribe\":true}'"
)
printf '%s\n' "$INSTALL_OUTPUT"
if ! grep -Eq '"state"[[:space:]]*:[[:space:]]*"installed"' <<<"$INSTALL_OUTPUT"; then
  echo "The TV did not report a completed installation." >&2
  exit 1
fi

if [[ "$AUTOSTART" == true ]]; then
  echo "Installing the optional startup hook..."
  ssh "$TARGET" 'sh -s' <<'EOF'
cat > /var/lib/webosbrew/init.d/webos25menu-autostart <<'SCRIPT'
#!/bin/sh
nohup sh -c "sleep 15; /usr/bin/luna-send -n 1 -f luna://com.webos.applicationManager/launch '{\"id\":\"io.github.nenad.webos25menu\"}'" \
  >/tmp/webos25menu-autostart.log 2>&1 </dev/null &
SCRIPT
chmod 0755 /var/lib/webosbrew/init.d/webos25menu-autostart
EOF
fi

echo
echo "Installation complete."
echo "Open webOS 25 Menu, select the gear, and enable Home button integration."
if [[ "$AUTOSTART" == true ]]; then
  echo "The menu will also open automatically after future TV startups."
fi
