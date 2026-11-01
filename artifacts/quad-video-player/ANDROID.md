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

## Audio modes and themes

Settings keeps the surrounding surfaces OLED-black and saves the chosen accent.
The default is `#6b5cb1`, with the requested silver, green, red, and yellow plus
blue, rose, sage, and lilac alternatives.

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

The default purple accent is named **GameCubed**; its saved identifier is kept
unchanged so existing selections survive updates. Eight additional pastel
accents retain OLED-black surfaces. The entire settings body scrolls beneath a
fixed close button.

**Fill video quarters** is saved between launches: off means **Fit** (show the
whole video, black bars if needed); on means **Fill** (cover the quarter and
crop edges without stretching). The two equal rows contain two equal video
tiles each. Android texture-backed video views keep output clipped to the
respective tile, including in Fill mode.

The native launch screen transitions into a short four-tile welcome animation.
Reduced-motion accessibility settings use a static, shorter welcome instead.

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
