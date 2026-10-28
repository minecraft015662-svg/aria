#!/usr/bin/env bash
# Usage: curl -fsSL __BASE__/install.sh | sudo bash -s -- LICENSE_KEY [PANEL_PATH]
set -e
BASE="__BASE__"
KEY="$1"
PANEL="${2:-/var/www/pterodactyl}"

[ "$(id -u)" -eq 0 ] || { echo "Please run as root (use sudo)."; exit 1; }
[[ "$KEY" =~ ^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$ ]] || { echo "Invalid license key."; exit 1; }
[ -f "$PANEL/artisan" ] || { echo "Pterodactyl not found at $PANEL"; exit 1; }
for c in curl unzip node yarn php; do command -v $c >/dev/null || { echo "Missing requirement: $c"; exit 1; }; done

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
OWNER="$(stat -c %U "$PANEL/artisan")"

echo "[1/5] Downloading theme..."
curl -fsSL "$BASE/download?key=$KEY" -o "$TMP/theme.zip" || { echo "License rejected or download failed."; exit 1; }
unzip -q "$TMP/theme.zip" -d "$TMP/x"
SRC="$(dirname "$(find "$TMP/x" -name tailwind.config.js -not -path '*/__MACOSX/*' | head -1)")"
[ -d "$SRC/app" ] || { echo "Theme files not found in zip."; exit 1; }

echo "[2/5] Backing up current panel files..."
BK="$PANEL-backup-$(date +%F-%H%M).tar.gz"
tar -czf "$BK" -C "$PANEL" app config resources public routes database tailwind.config.js 2>/dev/null || true
echo "      Backup: $BK"

echo "[3/5] Copying theme files..."
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
echo "Done! Theme installed. Hard refresh your panel (Ctrl+Shift+R)."
