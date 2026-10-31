---
name: Product requirements
description: User-stated platform, tablet, and visual requirements.
---

The user wants a native Android app, not a web app, for a 2960×1848, 239 ppi tablet powered by MediaTek Dimensity 9400+. The UI should be OLED-dark and use #6b5cb1 as its default primary color.

**Why:** The user explicitly specified the target hardware and corrected the platform and color direction.

**How to apply:** Preserve native Android video and storage capabilities, true-black surrounding surfaces, and this primary color. Do not substitute browser testing for native device verification or claim hardware performance without measurement.

The user requested accent themes #dddddd, #109b61, #f6392c, #ffd248, plus other dark pastel colors, while retaining OLED-black surfaces.

**Why:** The user asked for these exact settings options.

**How to apply:** Treat accent themes as alternatives to the default purple, not as light-background themes.

The user specified: “Implement a volume normalization toggle that reveals a ‘Sync’ toggle. The on position is true loudness normalization, off is shared slider levels.”

**Why:** Shared slider values alone do not normalize different source loudness, and the user explicitly distinguished the modes.

**How to apply:** Normalize off leaves independent controls. Normalize on reveals Sync; Sync on must process actual audio loudness, and Sync off links slider levels. Describe live adaptive leveling honestly rather than claiming a whole-file loudness scan.

Pool deletion means removing selected videos from the playback pool, not destroying their original files.

**Why:** The request concerns managing a selected pool; permanently deleting device media would be a separate destructive action.

**How to apply:** Keep removals non-destructive, and do not restart unrelated streams when removing a clip.

The user wants to add multiple background audio tracks that loop and have individual volume control.

**Why:** The user explicitly requested simultaneous background audio layers in addition to the four video streams.

**How to apply:** Keep each track's loop and volume independent. Closing its controls or scrolling the list must not stop its audio.
