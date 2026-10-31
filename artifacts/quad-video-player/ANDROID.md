# Standalone Android build

This is a native Expo/React Native application, not a WebView. The standalone
APK includes its JavaScript, fonts, and assets and does not require Expo Go or
a running Metro server.

## Build

With standard OpenJDK 21 and the Android SDK installed:

```sh
pnpm --filter @workspace/quad-video-player run build:android
```

The script generates the Android project if needed and compiles the release
variant for `arm64-v8a` (the target Dimensity tablet's architecture).
Set `ANDROID_HOME` if the SDK is not in the workspace's `.local/android-sdk`.
The SDK must include the platform, build tools, NDK, and CMake required by
the installed Expo/React Native versions. Accept Google's SDK license before
installing SDK packages.

Output:

```text
generated-artifacts/android/quad-video-player-arm64.apk
generated-artifacts/android/quad-video-player-arm64.apk.sha256
```

Build tools, Gradle caches, generated native files, and APKs are ignored by Git.
Keep app configuration in `app.json`; generated Android files can be regenerated.

## Install on the tablet

1. Transfer the APK to the tablet.
2. Open it in the tablet's file manager.
3. If prompted, allow that file manager to install unknown apps, then install.
4. Open **Quad Video Player** and choose local video files or a folder.
5. You can revoke the file manager's install permission afterward.

This personal sideload build uses Expo's **development signing key**, even
though it bundles the release app. Do not use that key for public distribution.
A public release needs a private signing key and a deliberate update/signing plan.

No Android device is connected to this workspace. Building and inspecting the
APK does not verify sustained decoding performance on the target tablet.
