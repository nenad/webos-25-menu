#!/usr/bin/env bash

set -Eeuo pipefail

REPOSITORY=nenad/webos-25-menu
APP_ID=io.github.nenad.webos25menu
REMOTE_IPK=/tmp/webos25menu.ipk

log() {
  printf '[webos25menu] %s\n' "$*"
}

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
  status=$?
  trap - EXIT
  rm -rf "$TEMP_DIR"
  if [[ "$UPLOADED" == true ]]; then
    log "Removing temporary package from the TV..."
    ssh -n "$TARGET" "rm -f '$REMOTE_IPK'" >/dev/null 2>&1 || true
  fi
  if [[ "$status" -ne 0 ]]; then
    log "Installation stopped with exit code $status." >&2
  fi
  exit "$status"
}
trap cleanup EXIT

log "Checking SSH access to $TARGET..."
ssh -n "$TARGET" 'printf "TV connection established.\\n"'

log "Finding the latest GitHub release..."
RELEASE_URL=$(curl -fsSL -o /dev/null -w '%{url_effective}' \
  "https://github.com/$REPOSITORY/releases/latest")
if [[ "$RELEASE_URL" != */tag/v* ]]; then
  echo "Could not determine the latest release from: $RELEASE_URL" >&2
  exit 1
fi
VERSION=${RELEASE_URL##*/v}
ASSET="${APP_ID}_${VERSION}_all.ipk"
DOWNLOAD_URL="https://github.com/$REPOSITORY/releases/download/v${VERSION}/${ASSET}"
log "Latest release: v$VERSION"
log "Release asset: $DOWNLOAD_URL"

log "Downloading $ASSET..."
curl -fL "$DOWNLOAD_URL" -o "$LOCAL_IPK"
log "Downloaded $(wc -c < "$LOCAL_IPK" | tr -d ' ') bytes."

log "Uploading the package to $REMOTE_IPK..."
scp -O "$LOCAL_IPK" "$TARGET:$REMOTE_IPK"
UPLOADED=true
log "Upload complete."

log "Starting webOS package installation (this can take up to a minute)..."
INSTALL_LOG="$TEMP_DIR/install.log"
set +e
ssh -n -tt "$TARGET" \
  "timeout 75 luna-send -w 60000 -i luna://com.webos.appInstallService/dev/install '{\"id\":\"com.ares.defaultName\",\"ipkUrl\":\"$REMOTE_IPK\",\"subscribe\":true}'" \
  2>&1 | tr -d '\r' | tee "$INSTALL_LOG"
PIPE_STATUSES=("${PIPESTATUS[@]}")
set -e
SSH_STATUS=${PIPE_STATUSES[0]}

if ! grep -Eq '"state"[[:space:]]*:[[:space:]]*"installed"' "$INSTALL_LOG"; then
  log "SSH exit code: $SSH_STATUS" >&2
  echo "The TV did not report a completed installation." >&2
  exit 1
fi
if [[ "$SSH_STATUS" -ne 0 ]]; then
  log "The SSH command closed with status $SSH_STATUS after the TV reported success; continuing."
fi
log "webOS reported that version $VERSION is installed."

if [[ "$AUTOSTART" == true ]]; then
  log "Installing the optional 15-second startup hook..."
  ssh "$TARGET" 'sh -s' <<'EOF'
cat > /var/lib/webosbrew/init.d/webos25menu-autostart <<'SCRIPT'
#!/bin/sh
nohup sh -c "sleep 15; /usr/bin/luna-send -n 1 -f luna://com.webos.applicationManager/launch '{\"id\":\"io.github.nenad.webos25menu\"}'" \
  >/tmp/webos25menu-autostart.log 2>&1 </dev/null &
SCRIPT
chmod 0755 /var/lib/webosbrew/init.d/webos25menu-autostart
printf 'Autostart hook installed.\\n'
EOF
else
  log "Autostart was not requested."
fi

log "Removing the uploaded package from the TV..."
ssh -n "$TARGET" "rm -f '$REMOTE_IPK'"
UPLOADED=false

echo
log "Installation complete."
log "Open webOS 25 Menu, select the gear, and enable Home button integration."
if [[ "$AUTOSTART" == true ]]; then
  log "The menu will also open automatically after future TV startups."
fi
