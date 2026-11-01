---
name: Media compatibility
description: Background audio from videos and native decoder scope.
---

Background audio may use audio files or the audio track of a video file. It must
not render or decode that video's picture.

**Why:** The user explicitly requested audio from video sources. Four simultaneous
video streams already need the tablet's video decoders; extra audio layers must
not compete for those decoder slots.

**How to apply:** Keep loops and volume independent for both source types. Report
missing audio rather than silently looping a video with no sound.

Use native Media3/Android codec support rather than promising all codecs within
a named container or silently transcoding files.

**Why:** Native decoding keeps the tablet player focused on concurrent playback;
adding large software-decoder bundles or conversion is a separate scope decision.

**How to apply:** Keep picker/discovery filters aligned with native container
support, distinguish containers from codecs, and report unsupported media honestly.

Do not treat Expo's `audioTrack === null` alone as proof that a file has no audio.

**Why:** This Android implementation resolves that getter from explicit track
overrides or preferred languages; default automatic selection may still return
null even for a valid audio file.

**How to apply:** Use loaded source metadata to detect absent audio. If checking
actual decoder selection, inspect Media3's selected track groups rather than the
Expo getter. Available track metadata by itself does not prove codec support.
