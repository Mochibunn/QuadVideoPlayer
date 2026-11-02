---
name: Samsung heart-rate bridge
description: Device and SDK constraints for live heart-rate display on the tablet.
---

The user wants live heart rate on the tablet from a watch paired to their phone. They have Galaxy Watch 6 and Watch 8 devices and can sideload phone/watch apps and enable Samsung Health Sensor Service developer mode. Readings must keep flowing after the watch app screen is hidden.

**Why:** The user reported that readings eventually stopped. An Activity-owned sensor tracker can be suspended or destroyed when the watch UI leaves the foreground.

**How to apply:** Keep the Samsung tracker in a health-type foreground service, request the OS-version-appropriate background sensor permission, and reconnect after prolonged sensor silence. Relay through the paired phone to the tablet. Samsung developer mode is for testing; normal distribution requires Samsung app approval and signature registration.
