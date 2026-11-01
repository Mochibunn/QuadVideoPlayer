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

Changing the Android package ID can leave React Native's cached autolinking
metadata referring to the old BuildConfig package even after prebuild has
correctly updated the namespace, application ID and Kotlin source packages.

**Why:** The autolinking configuration cache watches package metadata, not every
native app configuration input. Incremental builds can therefore compile a
generated Java entry point against the previous identity.

**How to apply:** On a package-ID change, check and invalidate the cached
android/build/generated/autolinking/autolinking.json if it still has the old
project.android.packageName, then let Gradle regenerate it. Do not hand-edit
generated Java or discard all native/C++ build intermediates.

Whole-activity PiP must prepare every player to remain active before calling
Android's entry method, then restore ordinary background behavior on exit.

**Why:** Android can deliver the pause/background lifecycle event before the
PiP-mode callback. Checking only the current PiP flag in a pause handler can
therefore pause all four streams during the transition.

**How to apply:** Arm the player background exemption before entering and
allow the overlay fade to finish. Clear the exemption after expansion/failure,
and explicitly pause the mix when the PiP window is closed.
