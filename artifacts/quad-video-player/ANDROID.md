# Standalone Android build

This is a native Expo/React Native application, not a WebView. The standalone
APK includes its JavaScript, fonts, and assets and does not require Expo Go or
a running Metro server.

## Build

With standard OpenJDK 21 and the Android SDK installed:

```sh
pnpm --filter @workspace/quad-video-player run build:android
```

The script generates the Android project if needed and compiles the release
variant for `arm64-v8a` (the target Dimensity tablet's architecture).
For a personal sideload build, minification/resource shrinking are disabled to
avoid the expensive whole-app optimizer. Set `ANDROID_MINIFY=true` to opt into
the smaller, optimized package; this does not change the native video decoders.
Set `ANDROID_HOME` if the SDK is not in the workspace's `.local/android-sdk`.
The SDK must include the platform, build tools, NDK, and CMake required by
the installed Expo/React Native versions. Accept Google's SDK license before
installing SDK packages.

Output:

```text
generated-artifacts/android/quad-video-player-arm64.apk
generated-artifacts/android/quad-video-player-arm64.apk.sha256
```

Build tools, Gradle caches, generated native files, and APKs are ignored by Git.
Keep app configuration in `app.json`; generated Android files can be regenerated.

## Install on the tablet

1. Transfer the APK to the tablet.
2. Open it in the tablet's file manager.
3. If prompted, allow that file manager to install unknown apps, then install.
4. Open **Quad Video Player** and choose local video files or a folder.
5. You can revoke the file manager's install permission afterward.

This personal sideload build uses Expo's **development signing key**, even
though it bundles the release app. Do not use that key for public distribution.
A public release needs a private signing key and a deliberate update/signing plan.

No Android device is connected to this workspace. Building and inspecting the
APK does not verify sustained decoding performance on the target tablet.

## Playback troubleshooting and image overlay

Native video sources load through guarded async preparation, with staggered
slot startup rather than simultaneous constructor playback. Local read-ahead
targets are 12 MiB per video and 2 MiB per background track, with size taking
priority over buffering time. These limits do not include decoder surfaces,
GIF frames, or total app RAM, and cannot guarantee arbitrary 4×4K codec support.

If Android closes the app, reopen it. A previous crash report is offered when
Android has one available. **Settings → Last crash report** can show/share it
again. Reports remain on the device unless the user explicitly shares them;
they may contain local media filenames. Java crashes are recorded before
delegating to Android's normal crash handler, and Android 11+ exit history can
also identify native crashes, ANRs, or low-memory termination. Some system exits
have no stack trace. No physical tablet is attached here, so startup hardening
is not proof that a reported hardware crash has been resolved.

**Settings → Image / GIF slideshow** manages a separate, additive image pool.
Enable **Show slideshows** to overlay it on active video playback. Use
**Add bouncing slideshow** to create more independent overlays from that same
pool. Select an overlay in the horizontal slideshow list to adjust or remove
it. Each has its own enable toggle, next-image button, scale, opacity, placement,
interval, bounce toggle, and speed. There is no fixed app-imposed count limit,
but actual capacity depends on image sizes, animated GIFs, and available tablet
memory/GPU resources. Removing an overlay does not remove shared images.

Controls
include scale, opacity, horizontal/vertical placement, time per image, and
DVD-style bounce with speed adjustment. Images fit without distortion; the
overlay passes touches through to the existing player controls. GIFs animate
natively, pool previews are static, and bounce runs as native-driver timing
loops rather than per-frame JavaScript work.

Save session includes the shared pool and every overlay's current image,
placement, and motion settings. Each overlay advances locally; saving samples
their live indices without sending every image change through the whole app.
Older single-overlay checkpoints migrate without changing their settings.
Sessions predating the image overlay still load with overlays disabled.
Removing an image from the pool never deletes its source file.

## Saved session

Use **Save session** (the floppy-disk toolbar icon during playback) to save one
complete checkpoint. **Resume saved session** is available after reopening the
app; nothing starts playing automatically at launch. Saving again asks before
replacing the previous checkpoint.

The checkpoint includes the full selected video pool, current video and
position in each quadrant, individual play/mute/volume state, shared level and
normalization mode, background tracks with positions and levels, accent theme,
Fit/Fill, control timeout, EQ, reverb, and echo. Saving does not pause or restart
the active players. Resume deliberately replaces the current mix after asking.

Android grants are retained when the provider supports them. Third-party
GET_CONTENT selections can be temporary; the app warns at save time instead of
copying potentially huge video files. A system-picker document selection or
granted folder is preferable for lasting access. Any permission can still be
revoked or storage disconnected.

Resume checks actual readability before changing the live mix. Unavailable
media is listed for confirmation; missing quadrants can use other available
pool videos from the beginning. The stored checkpoint is never overwritten by
a partial restore, cancellation, or failed resume. Reconnect storage/re-grant
access and retry to use the original checkpoint.

## File manager selection and pool previews

**Select files** (and **Add audio tracks**) offers Samsung My Files, an Android
chooser for other installed compatible apps, or the existing system picker.
My Files must be installed and expose a compatible selection activity.
Long-press to multi-select when the chosen manager supports it. Canceling leaves
the current pool/audio untouched. These choices do not replace Android's
separate, restricted folder-grant dialog.

Selections use the returned read grants without copying large media files.
Third-party managers may grant only temporary access; do not assume those URIs
will remain readable after a restart.

The video pool shows small cached still previews beside filenames. Generation
is serialized, requests for unmounted rows are skipped, and the disk cache is
bounded to 32 MiB. Unsupported or inaccessible previews display **No preview**
without removing the video or interrupting playback.

## Audio modes and themes

### Picture-in-picture and sound effects

During video playback, the **Picture in picture** toolbar button minimizes the
entire 2×2 layout into one Android PiP window. App controls fade out for the
compact window; expand it to return to the full controls. Android must support
PiP and allow it for this app. Entering PiP is explicit, not automatic on Home.
Closing the PiP window pauses the mix rather than leaving hidden playback.

Settings includes saved **Cozy room**, **Concert hall**, and **Dreamy plate**
reverb choices, an **Echo** toggle, and a **5-band equalizer** spanning 60 Hz to
14 kHz with ±12 dB adjustments and Flat/Bass/Voice/Bright presets. These run in
each native PCM audio chain for both video streams and background audio.
Effects are off by default, EQ boosts reserve headroom, and **Reset sound
effects** restores unprocessed audio without changing volume or normalization.
Effects do not create extra video decoders. They do not depend on a device's
optional Android audio-effect implementation.

Settings keeps the surrounding surfaces OLED-black and saves the chosen accent.
The default is `#6b5cb1`, with the requested silver, green, red, and yellow plus
blue, rose, sage, and lilac alternatives.

Settings is organized into Playback, Appearance & sensory, Audio & voice, RPG &
rewards, Heart rate, Media sources, and Backup & diagnostics. Trans Pride,
Spectrum Calm, and Stim Garden are optional, level-one palettes; all retain
OLED-black surfaces. Spectrum Calm uses infinity-inspired colors rather than
puzzle-piece imagery.

With **Normalize volume** off, each stream has its own slider. Turning it on
reveals **Sync**:

- **Sync off:** a native, per-player PCM processor measures K-weighted loudness
  in 400 ms windows and adapts gain toward -18 LUFS, with gated measurements,
  a bounded gain range, and a peak ceiling. This is live normalization, not a
  full-file/offline integrated-LUFS scan; the opening moments can take time to
  settle. The player's slider remains an independent output trim.
- **Sync on:** the four volume sliders use one shared level instead.

The switch labels show explicit ON/OFF states. Normalize off always bypasses
both processing and slider linking. Background-audio tracks remain independent.

## Display options and launch

### Downloads and Android storage access

Choose **Choose folder → Downloads** to build a pool from videos Android has
indexed in Downloads and its subfolders. Android 11 and newer deliberately
disable the Downloads root in the standard folder picker; storage permission
cannot unlock that picker option. The shortcut uses native MediaStore instead.
**Other folder** keeps the recursive folder picker for locations Android allows.

The shortcut asks for video access only when selected. On Android 14+, **Allow
all videos** includes the full Downloads video library; selected-only access
includes only permitted videos and is labelled accordingly. If access is denied,
the app offers Android Settings and individual file selection. **Choose videos**
also handles files that Android has not indexed, without broad library access.
No “manage all files” permission is requested. Android 12 and older use the
legacy read permission, limited in the manifest to API 32 and below.

The Android application ID is now `com.mochi.quadvideoplayer`. This is a separate
application from the earlier `com.anonymous.quadvideoplayer` builds. It does not
replace their installation or inherit their private settings.

Playback uses the entire app window as a gapless 2×2 grid: no toolbar, filename
row or volume-control row reserves space around the video. Android's navigation
bar is hidden during playback; an edge swipe can reveal system navigation.

Tap a video to toggle the toolbar and per-video controls with a short fade.
These are translucent overlays and disappear after 5 seconds without interaction
by default. Settings has a saved 0–30 second slider in one-second steps; 0 means
never auto-hide (tap still toggles the controls). Holding a control,
opening a panel or file picker, or using a screen reader keeps controls visible.
After closing a panel or returning to the app, a fresh idle interval starts.
Showing or hiding controls never remounts the video views or restarts streams.

The default purple accent is named **GameCubed**; its saved identifier is kept
unchanged so existing selections survive updates. The settings category content
scrolls beneath a fixed header and close button.

**Fill video quarters** is saved between launches: off means **Fit** (show the
whole video, black bars if needed); on means **Fill** (cover the quarter and
crop edges without stretching). The two equal rows contain two equal video
tiles each. Android texture-backed video views keep output clipped to the
respective tile, including in Fill mode.

The native launch screen transitions into a short four-tile welcome animation.
Reduced-motion accessibility settings use a static, shorter welcome instead.

## Watch heart-rate access

Android does not repeat a heart-rate permission prompt when the permission is
already granted. In that case, **Start tracking** connects directly and the
watch status changes to a connection or sensor message. The **App permissions**
link opens Android settings if access needs to be reviewed or changed. Keep the
ongoing tracking notification active for background readings.

The Android processor is carried in the pnpm patch for `expo-video`. It requires
a newly built standalone APK; Expo Go does not include it. The Android build
runs synthetic-signal unit tests before packaging. The package's Android
autolinking configuration forces `expo-video` to build from source: Expo's
precompiled library would otherwise omit the custom processor.

The pool list removes selections only. Original files are never deleted or
rewritten. Removing a currently playing clip advances that stream without
restarting the other streams.

## Background audio layers

Open the music-note button in the main toolbar and choose **Add audio tracks**.
The native file picker accepts multiple audio or video files, and more can be added later.
Each selected track has an independent looping player, volume slider, mute,
play/pause, retry, and non-destructive remove control. The panel also provides
play/pause for the complete audio group.

Audio players remain mounted outside the modal and virtualized rows, so closing
the panel or scrolling cannot stop playback. They use the native player in
audio-only mode: video-track selection is disabled before the source is loaded,
so video files use only their audio track without occupying video decoder slots.
No additional video surface is created. Files with no usable audio track produce
an explicit error. Background-track levels
are not linked to video Sync or video normalization. Video toolbar controls
operate only on the four videos; audio has its own controls.

“Background audio” means audio layered behind the videos while using the app.
It does not enable an Android screen-off/background playback service. Selections
and mix levels last for the current app session, and source files are not copied,
deleted, or rewritten.

## Media formats

The video file picker and recursive folder scan recognize MP4/M4V, MOV,
WebM, MKV, 3GP/3G2, AVI, MPEG-TS (TS/MTS/M2TS), MPEG-PS
(MPEG/MPG/VOB), and FLV/F4V. Background audio accepts these video
containers as audio-only sources, plus MP3, M4A/M4B, AAC/ADTS, WAV,
FLAC, Ogg/Opus, AMR/AWB, and Matroska audio (MKA).

Pickers show all files so Android document providers that use generic binary MIME
types cannot hide otherwise playable MOV/MKV/audio files. The app validates names
and media MIME types, reports rejected non-media selections, and preserves
independent loops, volumes, mute, pause and removal for accepted tracks.

The native player is Android Media3/ExoPlayer. A recognized container is not a
promise that every codec/profile inside it is decodable: typical H.264/AAC MP4 or
MOV and VP8/VP9/Opus WebM rely on device decoders. For example, ProRes MOV,
legacy WMV/WMA, some AVI codecs, DTS, DRM-protected content, and damaged files
may not play. No FFmpeg software decoder or automatic conversion is bundled.
Unsupported files show an error rather than being labelled successfully playing.
Actual decode compatibility must be verified on the target Android hardware.
