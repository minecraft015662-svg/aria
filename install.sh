#!/usr/bin/env bash
# Usage:
#   curl -fsSL __BASE__/install.sh | sudo bash -s -- install   LICENSE_KEY [PANEL_PATH]
#   curl -fsSL __BASE__/install.sh | sudo bash -s -- update    LICENSE_KEY [PANEL_PATH]
#   curl -fsSL __BASE__/install.sh | sudo bash -s -- uninstall [PANEL_PATH]
set -e
BASE="__BASE__"
MODE="$1"

[ "$(id -u)" -eq 0 ] || { echo "Please run as root (use sudo)."; exit 1; }

if [ "$MODE" = "uninstall" ]; then KEY=""; PANEL="${2:-/var/www/pterodactyl}"
else KEY="$2"; PANEL="${3:-/var/www/pterodactyl}"; fi

case "$MODE" in install|update|uninstall) ;; *) echo "Use: install | update | uninstall"; exit 1;; esac
[ -f "$PANEL/artisan" ] || { echo "Pterodactyl not found at $PANEL"; exit 1; }
ORIG="$PANEL/.arix-original.tar.gz"
FILES="$PANEL/.arix-files"
OWNER="$(stat -c %U "$PANEL/artisan")"

# ---------------- UNINSTALL ----------------
if [ "$MODE" = "uninstall" ]; then
  [ -f "$ORIG" ] || { echo "No original backup found. Theme was not installed by this script."; exit 1; }
  echo "[1/3] Removing files added by the theme..."
  tar -tzf "$ORIG" | sed 's#/$##' | sort -u > /tmp/arix-orig.txt
  sort -u "$FILES" > /tmp/arix-theme.txt
  comm -13 /tmp/arix-orig.txt /tmp/arix-theme.txt | while read -r f; do rm -f "$PANEL/$f"; done
  echo "[2/3] Restoring original panel files..."
  tar -xzf "$ORIG" -C "$PANEL"
  echo "[3/3] Finishing..."
  cd "$PANEL"
  php artisan view:clear
  php artisan config:clear
  rm -f "$PANEL/.arix-license" "$FILES" "$ORIG"
  chown -R "$OWNER":"$OWNER" "$PANEL"
  echo "Done! Theme uninstalled. Hard refresh your panel (Ctrl+Shift+R)."
  exit 0
fi

# ---------------- INSTALL / UPDATE ----------------
[[ "$KEY" =~ ^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$ ]] || { echo "Invalid license key."; exit 1; }
for c in curl unzip node yarn php tar; do command -v $c >/dev/null || { echo "Missing requirement: $c"; exit 1; }; done
if [ "$MODE" = "update" ] && [ ! -f "$ORIG" ]; then echo "Theme is not installed yet. Use install first."; exit 1; fi

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

echo "[1/5] Downloading theme..."
curl -fsSL "$BASE/download?key=$KEY" -o "$TMP/theme.zip" || { echo "License rejected or download failed."; exit 1; }
unzip -q "$TMP/theme.zip" -d "$TMP/x"
SRC="$(dirname "$(find "$TMP/x" -name tailwind.config.js -not -path '*/__MACOSX/*' | head -1)")"
[ -d "$SRC/app" ] || { echo "Theme files not found in zip."; exit 1; }

echo "[2/5] Backing up current panel files..."
if [ ! -f "$ORIG" ]; then
  tar -czf "$ORIG" -C "$PANEL" app config resources public routes database tailwind.config.js
  echo "      Original backup saved (used by uninstall)."
else
  echo "      Original backup already exists, keeping it."
fi

echo "[3/5] Copying theme files..."
( cd "$SRC" && find . -type f -not -name .DS_Store | sed 's#^\./##' ) >> "$FILES"
sort -u "$FILES" -o "$FILES"
cp -a "$SRC"/. "$PANEL"/
find "$PANEL" -name .DS_Store -delete

echo "[4/5] Building panel (takes a few minutes)..."
cd "$PANEL"
export NODE_OPTIONS=--openssl-legacy-provider
yarn install
yarn build:production

echo "[5/5] Finishing..."
php artisan migrate --force
php artisan view:clear
php artisan config:clear
echo "$KEY" > "$PANEL/.arix-license"
chown -R "$OWNER":"$OWNER" "$PANEL"
echo "Done! Theme ${MODE}d. Hard refresh your panel (Ctrl+Shift+R)."
