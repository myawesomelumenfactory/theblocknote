#!/bin/bash
# Repair IPFS Desktop on this Mac:
# - clears a corrupted auto-updater cache (checksum mismatch loop)
# - restores default API/Gateway ports (5001 / 8080)
# - relaunches IPFS Desktop
set -euo pipefail

echo "Fixing IPFS Desktop..."

osascript -e 'tell application "IPFS Desktop" to quit' >/dev/null 2>&1 || true
sleep 2
pkill -f '/Applications/IPFS Desktop.app' 2>/dev/null || true
pkill -f 'kubo/kubo/ipfs daemon' 2>/dev/null || true
sleep 1
rm -f "$HOME/.ipfs/repo.lock" 2>/dev/null || true

echo "Clearing corrupted updater cache..."
rm -rf "$HOME/Library/Caches/ipfs-desktop-updater/pending"
rm -f "$HOME/Library/Caches/ipfs-desktop-updater/update.zip"
rm -rf "$HOME/Library/Caches/io.ipfs.desktop.ShipIt"
rm -f "$HOME/Library/Application Support/IPFS Desktop/SingletonLock" \
      "$HOME/Library/Application Support/IPFS Desktop/SingletonCookie" \
      "$HOME/Library/Application Support/IPFS Desktop/SingletonSocket" 2>/dev/null || true

echo "Restoring default API (5001) and Gateway (8080)..."
python3 - <<'PY'
import json
from pathlib import Path

path = Path.home() / ".ipfs" / "config"
cfg = json.loads(path.read_text())
cfg.setdefault("Addresses", {})["API"] = "/ip4/127.0.0.1/tcp/5001"
cfg["Addresses"]["Gateway"] = "/ip4/127.0.0.1/tcp/8080"
path.write_text(json.dumps(cfg, indent=2) + "\n")

desk = Path.home() / "Library/Application Support/IPFS Desktop/config.json"
dcfg = json.loads(desk.read_text())
dcfg["daemonConfigRevision"] = int(dcfg.get("daemonConfigRevision") or 0) + 1
desk.write_text(json.dumps(dcfg, indent="\t") + "\n")
print("API ->", cfg["Addresses"]["API"])
print("Gateway ->", cfg["Addresses"]["Gateway"])
PY

echo "Launching IPFS Desktop..."
open -a "IPFS Desktop"

ok=0
for _ in $(seq 1 45); do
  if curl -s -m 1 -X POST "http://127.0.0.1:5001/api/v0/version" >/dev/null; then
    ok=1
    break
  fi
  sleep 1
done

if [ "$ok" = 1 ]; then
  echo "Success. IPFS API is up on http://127.0.0.1:5001"
  curl -s -X POST "http://127.0.0.1:5001/api/v0/version"
  echo
else
  echo "Daemon did not respond on 5001. Check the IPFS Desktop window / menu bar icon."
  exit 1
fi
