#!/bin/sh

set -eu

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT
mkdir -p "$TEMP_DIR/bin"
LOG="$TEMP_DIR/commands.log"
export LOG

cat > "$TEMP_DIR/bin/curl" <<'EOF'
#!/bin/sh
case "$*" in
  *releases/latest*)
    printf '%s' 'https://github.com/nenad/webos-25-menu/releases/tag/v1.2.3'
    ;;
  *releases/download/v1.2.3/io.github.nenad.webos25menu_1.2.3_all.ipk*)
    while [ "$#" -gt 0 ]; do
      if [ "$1" = "-o" ]; then
        shift
        printf 'test-ipk' > "$1"
        break
      fi
      shift
    done
    ;;
  *)
    echo "Unexpected curl arguments: $*" >&2
    exit 1
    ;;
esac
EOF

cat > "$TEMP_DIR/bin/scp" <<'EOF'
#!/bin/sh
printf 'scp %s\n' "$*" >> "$LOG"
EOF

cat > "$TEMP_DIR/bin/ssh" <<'EOF'
#!/bin/sh
printf 'ssh %s\n' "$*" >> "$LOG"
case "$*" in
  *appInstallService/dev/install*)
    printf '%s\n' '{"state":"installed"}'
    exit 255
    ;;
  *sh\ -s*)
    cat >/dev/null
    ;;
  *"TV connection established"*)
    printf '%s\n' 'TV connection established.'
    ;;
esac
EOF

chmod 0755 "$TEMP_DIR/bin/curl" "$TEMP_DIR/bin/scp" "$TEMP_DIR/bin/ssh"
PATH="$TEMP_DIR/bin:$PATH" bash "$PROJECT_ROOT/install.sh" tv.local --autostart \
  >"$TEMP_DIR/output.log"

grep -Fq 'scp -O' "$LOG"
grep -Fq 'root@tv.local:/tmp/webos25menu.ipk' "$LOG"
grep -Fq 'appInstallService/dev/install' "$LOG"
grep -Fq 'SSH command closed with status 255' "$TEMP_DIR/output.log"
grep -Fq 'Installation complete.' "$TEMP_DIR/output.log"
grep -Fq 'future TV startups' "$TEMP_DIR/output.log"
