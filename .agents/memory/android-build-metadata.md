---
name: APK release verification
description: Validate the native APK's embedded identity and release metadata before delivery.
---

For an Android release, verify the final APK's application ID, version code/name, signature, and checksum instead of trusting `app.json` or Gradle inputs alone.

**Why:** Android Gradle metadata can lag Expo configuration, and the Wear OS companion is a separate Gradle app whose version can lag the phone APK too. Either mismatch can leave a signed but stale install package.

**How to apply:** Inspect each packaged APK separately. Keep phone and watch versions aligned, verify each manifest identity and signature, and checksum the exact files being shared.
