---
name: Product requirements
description: User-stated platform, tablet, and visual requirements.
---

Pawstar should answer verbosely and stay on the player's latest topic in Auto
mode. New AI cheer notes must append to the current editable user cheer text,
not exist only in a separate hidden collection; displayed notes should shuffle.

**Why:** The user reported off-topic Auto-chat rants and repeated cheers, and
explicitly requested verbose answers and editable generated notes.

**How to apply:** Preserve actual player instructions during long automatic
conversations, and keep generated cheer notes in the same visible, editable pool.

Decorative borders must stay behind both the pre-playback toolbar and active
playback controls. The UI should use pixel-art styling wherever practical.

**Why:** The user repeatedly reported borders obscuring distinct startup and
playback overlays and asked for more visible pixel-art UI.

**How to apply:** Check both no-video and active-video states when changing
overlay stacking, not just the in-session toolbar.

All settings should save automatically whenever they change, independently of
the explicit Save session action.

**Why:** The user explicitly requested “save all settings every time.”

**How to apply:** New preference controls need automatic persistence and startup
restoration, not just inclusion in a manually captured session.

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

The Android navigation area must also remain OLED-black, with light buttons.

**Why:** The user reported the white system navigation bar as an eyesore.
Expo's navigation style names describe button color, not background color;
`dark` requests dark buttons and can trigger a light Android contrast scrim.

**How to apply:** Use light navigation content, disable navigation contrast
enforcement, and keep the underlying activity/app background true black.
Preserve the existing immersive playback behavior.

The user wants file selection through another installed file manager, preferably
Samsung My Files, and small visual previews in the video pool.

**Why:** They find the built-in picker difficult to use and filenames alone are
not descriptive enough.

**How to apply:** Preserve third-party file-manager choices alongside a system
fallback. Treat previews as cached still images, not additional playing video
instances that compete with the four simultaneous streams.

Preserve whole-layout picture-in-picture and saved sound-playground settings
(room, chamber, hall, cathedral, plate, and spring reverb, echo, and adjustable
EQ) for videos and background audio. Reverb includes wet/dry, decay, and
pre-delay controls.

**Why:** The user requested PiP and fun sound-processing controls. Whole-layout
PiP preserves the app's four-stream purpose; processing each native PCM chain
avoids device-dependent audio-session effects.

**How to apply:** Keep the four players mounted and looping in PiP, hide app
overlays there, and stop playback when its window is closed. Effects default to
off and must retain an exact bypass and the Media3 empty-buffer safety contract.

The user wants an explicit Save session button so the previous active mix can
be resumed without rebuilding it.

**Why:** The user explicitly asked to avoid redoing the active session.

**How to apply:** Save a complete checkpoint, including the pool, four current
videos and positions, independent controls, background tracks and settings.
Resume must be explicit, preserve the saved copy on failure/partial restore,
and honestly report temporary or revoked Android file access.

The user wants a separate image/GIF slideshow overlay with adjustable scale,
position, opacity, and a slow DVD-logo-style bouncing option.
They also want multiple bouncing slideshows from the same shared pool,
"as many as we want"—do not impose a fixed instance-count limit.

**Why:** The user explicitly requested these controls alongside video playback.

**How to apply:** Keep the image/GIF pool separate from videos and background
audio, animate GIFs, preserve aspect ratio and screen bounds, and pass touches
through the overlay. Include its pool and controls in saved sessions. Multiple
instances must share the pool, not require separate copies, and keep independent
controls and timing. Each instance can shuffle its image order. Hardware resource
limits still apply.

The user wants to link a Reddit account and pull posts from configurable
subreddits, plus retrieve images from specific booru websites using tag filters.
They want multiple separate searches to supply independent kinds of images.
The booru sites specifically mean boards hosted on **booru.org**. Reddit should
supply **images, GIFs, and videos**, not a full text-post reader.

**Why:** The user explicitly requested these online media sources.

**How to apply:** Keep searches configurable and independently assignable rather
than merging every query into one undifferentiated image pool. Confirm the booru
sites and desired Reddit media types before choosing provider-specific APIs.

The user also wants independent tagged searches from rule34.xxx and e621.net.
Rule34 API credentials are optional per-device credentials, never saved in
sessions; e621 uses its public API.

**Why:** The user explicitly requested both sites and approved secure on-device
Rule34 API credential setup.

**How to apply:** Keep site-specific rating syntax and request limits. Obtain API
credentials through the site's official account settings, store them only in
Android SecureStore, and never bypass a site's authentication or challenge.

Timed loop sessions should count time only during video playback: pausing stops
the clock but preserves the same session for resume. Explicitly ending playback
saves the duration and date to a device-local leaderboard; sessions of at least
one hour receive a visible achievement. Keep this history separate from the
playback-resume snapshot.

**Why:** The user chose pause-and-resume timing and requested a dated leaderboard
and an hour-long achievement. A personal leaderboard does not require an
external account or remote service.

**How to apply:** Do not record a pause as a finished score or count time while
video playback is paused. Preserve completed scores and the lifetime play total
on device across app restarts.

The four video quadrants share local last-played history: prioritize unwatched
clips, then clips played least recently, with random tie-breaking.

**Why:** The user asked for each quadrant to favor unwatched or oldest-watched
videos while maintaining a shared sense of recency.

**How to apply:** Keep history across app restarts and session resumes, and apply
the same global ordering to initial selection and subsequent per-quadrant picks.

Each background audio track may be boosted up to 200%; above 100% can distort
audio.

**Why:** The user explicitly asked to raise background-track volume above 100%;
a bounded native gain avoids an unbounded volume control.

**How to apply:** Keep track gain independent and persistent, preserve the
ordinary 0–100% range, and make the clipping tradeoff clear.

The user wants optional transgender-pride and autism/stimming-themed accent
palettes alongside the existing OLED-black themes.

**Why:** The user explicitly requested these additional visual options.

**How to apply:** Keep these palettes optional and immediately available, preserve
GameCubed as the default, and use respectful trans-flag and neurodiversity
infinity-inspired colors rather than treating identity themes as progression
rewards.

Every Goon Quest app update needs a playful, activity-specific release codename
and an in-game patch-notes menu.

**Why:** The user explicitly asked each incremental update to have a quirky name
and its changes available inside the game.

**How to apply:** When updating the app version, add a matching release-note entry
and keep the patch-notes screen accessible from the settings menu.

Local storyteller models must be imported by the user as GGUF files and run on
the device. On the MediaTek tablet, do not claim Qualcomm-only GPU/NPU
acceleration.

**Why:** The user asked for a local model on MediaTek hardware; the available
React Native runtime documents acceleration for Qualcomm backends, not this
device.

**How to apply:** Keep model files out of the APK and network, be explicit about
CPU performance and memory costs, and use only verified acceleration paths.
