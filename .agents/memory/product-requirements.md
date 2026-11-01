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

The user wants Normalize volume to reveal a Sync toggle. Their later correction explicitly reverses the earlier Sync mapping: Sync ON shares slider levels; Sync OFF performs true loudness normalization.

**Why:** Shared slider values alone do not normalize different source loudness, and the user explicitly distinguished the modes.

**How to apply:** Normalize off leaves independent controls. Normalize on reveals Sync; Sync on links slider levels, and Sync off processes actual audio loudness. Describe live adaptive leveling honestly rather than claiming a whole-file loudness scan.

Pool deletion means removing selected videos from the playback pool, not destroying their original files.

**Why:** The request concerns managing a selected pool; permanently deleting device media would be a separate destructive action.

**How to apply:** Keep removals non-destructive, and do not restart unrelated streams when removing a clip.

The user wants to add multiple background audio tracks that loop and have individual volume control.

**Why:** The user explicitly requested simultaneous background audio layers in addition to the four video streams.

**How to apply:** Keep each track's loop and volume independent. Closing its controls or scrolling the list must not stop its audio.

The default purple theme is called “GameCubed,” not Amethyst. The user also wants a Fit/Fill video setting, more OLED accent themes, a fun splash screen, and settings that scroll when taller than the screen.

**Why:** The user explicitly requested these appearance and display behaviors.

**How to apply:** Preserve the default purple color while using its requested display name. Fit must show the whole video; Fill may crop but must not stretch or spill outside the video's quarter.

The user wants on-screen controls to auto-hide and each video to occupy its
actual quarter of the whole screen, not a smaller rectangle between controls.

**Why:** The user reported that individual control rows were reducing the video
areas and preventing true full-screen quadrants.

**How to apply:** Toolbar, filename and volume controls must overlay playback
rather than reserve layout space. Keep a gapless 2×2 viewport, and never resize
or restart video players when controls hide.

Tapping a video must toggle the controls in both directions with a fade. Settings
must include a saved slider from 0 to 30 seconds for the auto-hide delay.

**Why:** The user reported that screen taps were not fading controls away and
explicitly requested the timing slider.

**How to apply:** A video tap must hide already-visible controls, not reveal
them again on touch-down. Keep ordinary control interactions separate from
video-surface taps, so adjusting playback does not accidentally hide controls.

Keep the user's chosen Android application identity: `com.mochi.quadvideoplayer`.

**Why:** The user explicitly requested this package name. Android treats a
package-name change as a separate application, without the previous app's data.

**How to apply:** Preserve this identity in future builds; do not replace it with
an Expo-generated default or rename it for routine updates.
