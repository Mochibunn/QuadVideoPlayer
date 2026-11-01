---
name: Expo native source patches
description: Why patched Android Expo modules must bypass precompiled publications.
---

Force source builds for any Expo Android module whose native code is patched.

**Why:** This Expo version normally links precompiled module publications. A local Kotlin patch alone is ignored, and the module's Gradle test/compile project may not exist. A successful app build could otherwise omit the feature entirely.

**How to apply:** Use the app package's Expo autolinking Android `buildFromSource` option for modified modules. Confirm their source compilation and unit tests run; Expo Go cannot validate newly added native properties.

Expo SDK 58's prebuild recreates native folders by default. Prefer `--no-clean`
for incremental configuration updates when an existing native project is valid.

**Why:** Recreating the Android folder removes native build intermediates and
turns a small settings/configuration update into a much longer C++ rebuild.

**How to apply:** Use incremental prebuild to sync versions and plugins. Reserve
a clean regeneration for SDK upgrades or changes that genuinely require it.
