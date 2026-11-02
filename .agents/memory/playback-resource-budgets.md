---
name: Playback resource budgets
description: Why four local video streams need explicit buffer and startup limits.
---

Budget read-ahead per player and stagger initial source preparation for the
four-video workload. Do not use single-player streaming defaults uncritically.

**Why:** Four independent caches multiply memory use before accounting for
decoder surfaces, background audio, or animated images. The user reported a
process-closing failure at video startup, but no tablet crash trace was
available to establish its actual cause.

The user subsequently confirmed that playback worked in the updated build
after the startup and buffer hardening. The shared Android exit report lacked
a stack trace, so it did not establish the original crash's precise cause.

**How to apply:** Keep local-file read-ahead bounded and load failures handled.
Never describe compressed-buffer targets as total RAM usage, or claim native
crash resolution based only on compilation/unit checks. Use the on-device
crash/exit report to distinguish Java, native-code, and low-memory failures.

When gameplay needs one video full-screen, reuse a current quadrant player and
restore the prior focus afterward; do not add a fifth video decoder.

**Why:** Boss fights need a moving video deadline, while another decoder would
compound the tablet's existing four-player memory and surface load.

**How to apply:** Tie full-screen encounters to a selected active stream, track
its playback position/end, and return to the previous quad/focus state afterward.
