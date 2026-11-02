---
name: Samsung heart-rate bridge
description: Device and SDK constraints for live heart-rate display on the tablet.
---

The user wants live heart rate on the tablet from a watch paired to their phone. They have Galaxy Watch 6 and Watch 8 devices and can sideload phone/watch apps and enable Samsung Health Sensor Service developer mode.

**Why:** The user confirmed the watch models and testing setup while choosing live tablet display.

**How to apply:** Use a watch-side Samsung Health Sensor SDK tracker, relay through the paired phone, and deliver to the tablet locally. Samsung developer mode is for testing; normal distribution requires Samsung app approval and signature registration.
