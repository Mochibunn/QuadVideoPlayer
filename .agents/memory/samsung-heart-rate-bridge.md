---
name: Samsung heart-rate bridge
description: Device and SDK constraints for live heart-rate display on the tablet.
---

The user wants live heart rate on the tablet from a watch paired to their phone. They have Galaxy Watch 6 and Watch 8 devices and can sideload phone/watch apps and enable Samsung Health Sensor Service developer mode. Readings must keep flowing after the watch app screen is hidden.

**Why:** The user reported that readings eventually stopped. An Activity-owned sensor tracker can be suspended or destroyed when the watch UI leaves the foreground.

**How to apply:** Keep the Samsung tracker in a health-type foreground service, request the OS-version-appropriate background sensor permission, and reconnect after prolonged sensor silence. Relay through the paired phone to the tablet. Samsung developer mode is for testing; normal distribution requires Samsung app approval and signature registration.

Android does not show another runtime permission prompt once heart-rate access is granted.

**Why:** The user observed that the watch permission was already allowed while tapping Start produced no permission dialog.

**How to apply:** Explain that Start connects directly when access is granted, show foreground/background permission state, and provide a direct route to app permissions for review.

Sensor permission migration depends on the app's target API as well as the watch OS. An app targeting API 35 still uses BODY_SENSORS on an Android 16 watch; granular health permissions apply when targeting API 36+.

**Why:** Requiring both legacy access and incorrectly named new permissions blocked Start even after the user revoked and reallowed sensor access. Samsung's permission guide confirms the target-SDK distinction.

**How to apply:** Use the same permission policy in the Activity and foreground service. New permissions use the android.permission.health namespace. Do not ask users to keep resetting a grant when a target-version mismatch is the cause.
