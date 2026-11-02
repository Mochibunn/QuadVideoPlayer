#!/usr/bin/env bash
# Builds a self-contained, development-key-signed APK for personal sideloading.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE="$(cd "$APP_DIR/../.." && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-$WORKSPACE/.local/android-sdk}"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$WORKSPACE/.local/gradle}"

if ! command -v java >/dev/null || [[ ! -d "$ANDROID_HOME/platforms" ]]; then
  echo "Java and the Android SDK are required. Set ANDROID_HOME to an installed SDK." >&2
  exit 1
fi

cd "$APP_DIR"
if [[ ! -f android/gradlew ]]; then
  pnpm exec expo prebuild --platform android --no-install
fi

cd android
./gradlew :expo-video:testDebugUnitTest :downloads-media:testDebugUnitTest \
  :samsung-health-bridge:testDebugUnitTest :app:assembleRelease :wear:assembleRelease \
  -PreactNativeArchitectures=arm64-v8a \
  -Pandroid.enableMinifyInReleaseBuilds="${ANDROID_MINIFY:-false}" \
  -Pandroid.enableShrinkResourcesInReleaseBuilds="${ANDROID_MINIFY:-false}" \
  --no-daemon --max-workers=2

OUTPUT="$WORKSPACE/generated-artifacts/android"
mkdir -p "$OUTPUT"
cp app/build/outputs/apk/release/app-release.apk "$OUTPUT/quad-video-player-arm64.apk"
cp wear/build/outputs/apk/release/wear-release.apk "$OUTPUT/quad-video-player-watch.apk"
cd "$OUTPUT"
sha256sum quad-video-player-arm64.apk > quad-video-player-arm64.apk.sha256
sha256sum quad-video-player-watch.apk > quad-video-player-watch.apk.sha256
echo "APK: $OUTPUT/quad-video-player-arm64.apk"
echo "Watch APK: $OUTPUT/quad-video-player-watch.apk"
echo "Signed with the development key; not intended for store distribution."
