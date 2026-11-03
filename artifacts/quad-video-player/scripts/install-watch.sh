#!/usr/bin/env bash
# Run on a computer with Android platform-tools; never uninstalls user data.
set -euo pipefail
if [[ $# -ne 2 ]]; then
  echo "Usage: bash install-watch.sh WATCH_ADB_SERIAL PATH_TO_WATCH_APK" >&2
  echo "Use 'adb devices' to find the connected watch serial." >&2
  exit 2
fi
command -v adb >/dev/null || { echo "Install Android platform-tools (adb) first." >&2; exit 2; }
SERIAL="$1"
APK="$2"
[[ -f "$APK" ]] || { echo "Watch APK not found: $APK" >&2; exit 2; }
FEATURES="$(adb -s "$SERIAL" shell pm list features)"
if ! grep -q 'android.hardware.type.watch' <<< "$FEATURES"; then
  echo "The selected device is not reporting itself as a Wear OS watch. Installation cancelled." >&2
  exit 2
fi
echo "Installing on watch $SERIAL without APK streaming; existing app data is kept."
adb -s "$SERIAL" install --no-streaming -r "$APK"
