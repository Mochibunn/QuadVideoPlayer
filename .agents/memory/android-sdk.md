---
name: Android SDK compatibility
description: Avoid unnecessary framework downgrades when resolving Android SDK packages.
---

Inspect SDK Manager's channel listings and exact package identifiers before concluding that the installed React Native version's SDK requirements cannot be satisfied.

**Why:** The default listing omitted required build tools, and the API platform used a minor-version identifier rather than the integer compile-SDK identifier. The appropriate channel listing exposed the matching packages.

**How to apply:** Resolve SDK requirements against official SDK metadata; do not downgrade Expo or React Native merely because a guessed package name fails. Request license consent before accepting new SDK terms.

Use standard OpenJDK rather than the GraalVM supplied by the Java module for Android compilation.

**Why:** GraalVM's `jlink` failed Android's JDK image transformation with a missing JVMCI module.

**How to apply:** Ensure the Android build selects standard OpenJDK on PATH or through JAVA_HOME before investigating app code for JDK image-transform errors.
