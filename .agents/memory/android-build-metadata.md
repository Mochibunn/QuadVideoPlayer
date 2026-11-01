---
name: APK release verification
description: Validate the native APK's embedded identity and release metadata before delivery.
---

For an Android release, verify the final APK's application ID, version code/name, signature, and checksum instead of trusting `app.json` or Gradle inputs alone.

**Why:** A release build exposed that the configured Expo version and the Android Gradle project's embedded version could diverge, leaving a signed but stale APK in the delivery folder.

**How to apply:** After building, inspect the packaged APK manifest and signature, compare them with the intended package identity and version, and checksum the exact file being shared.
