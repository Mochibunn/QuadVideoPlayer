---
name: APK release verification
description: Validate the native APK's embedded identity and release metadata before delivery.
---

For an Android release, verify the final APK's application ID, version code/name, signature, and checksum instead of trusting `app.json` or Gradle inputs alone.

**Why:** Android Gradle metadata can lag Expo configuration, and the Wear OS companion is a separate Gradle app whose version can lag the phone APK too. Either mismatch can leave a signed but stale install package.

**How to apply:** Inspect each packaged APK separately. Keep phone and watch versions aligned, verify each manifest identity and signature, and checksum the exact files being shared.

The Android SDK may be installed under `.local/android-sdk` while `ANDROID_HOME` and `ANDROID_SDK_ROOT` are unset.

**Why:** A native rebuild can fail during Gradle configuration even though the SDK and required platforms are already installed.

**How to apply:** Check the workspace SDK directory, then export both SDK environment variables for Gradle commands instead of reinstalling the SDK.

Gradle's worker limit does not constrain Ninja's internal native-build parallelism. Single-core affinity can protect CMake builds from memory spikes, but may make R8 shrinking impractically slow.

**Why:** Native compilation previously exhausted the workspace, while a constrained R8 release build spent an extended period in code shrinking.

**How to apply:** Build only the target ABI and constrain CPU affinity while CMake targets are compiling. Once native outputs are cached, allow R8 more CPU; for sideload-only builds under tight limits, `-Pandroid.enableMinifyInReleaseBuilds=false` skips optional shrinking without changing the project default, at the cost of a larger APK.
