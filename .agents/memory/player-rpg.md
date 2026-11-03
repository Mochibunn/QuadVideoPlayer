---
name: Player RPG progression
description: User-requested gamification direction for Goon Quest.
---

The user wants daily quests and streaks, skill trees with passive perks, earnable currency and an item shop, a companion or pet, and a furry fantasy identity with graphic adult gooning themes. Goon Quest is an adult-only game; preserve its Android package identity.

The image dungeon should support the local slideshow pool, saved Rule34/e621 searches, and separately marked Rule34/e621 enemy-tag searches.

**Why:** The user explicitly clarified that graphic adult writing is welcome because Goon Quest is adult-only.

**How to apply:** Use explicit sexual writing when it fits the game; portray sexualized characters as adults and make interactions consensual.

**Why:** The user chose support for both saved online searches and dedicated enemy-tag searches.

**How to apply:** Keep enemy tag searches configurable independently from slideshow source selection, and preserve their safe-rating settings.

Encounter enemies belong above the playing videos, not inside the quest window.

**Why:** The user explicitly wants larger, more randomly moving enemies in front of the streams. The quest window is for setup and quest management, not the combat arena.

**How to apply:** Keep active fights independent of quest-window visibility. Disable the video control overlays and their tap targets during enemy and boss fights; restore them when combat ends.

The timer button must stay stationary in the global overlay and must not show elapsed time.

**Why:** The user explicitly reversed the earlier moving-timer preference and wants time in a separately configurable transparent stats overlay.

**How to apply:** Keep timer/leaderboard, chat, and stats actions in the global controls; do not reintroduce a bouncing timer button.

The local AI may direct enemy movement, give enemies taunts and defeat lines in nearby speech balloons, and automatically add enemy-search tags during fights. Profanity is allowed.

**Why:** The user explicitly requested autonomous in-fight tag additions and AI-driven movement/dialogue.

**How to apply:** Expose clear AI and automatic-search controls, preserve avoid-tags and source rating settings, bound movement and request rates, and discard stale responses after encounter changes.

The user wants more of a game feel, paw-themed fantasy cosmetics, and Wii-like mini-games driven by real watch movement.

**Why:** The user explicitly requested watch-motion mini-games alongside border improvements.

**How to apply:** Use actual watch sensors and the paired-phone relay; describe wrist gestures rather than claiming Wii-style positional tracking.

Optional local-AI generation for quests, honors, and cheers must remain off by default and rate-limited while videos are playing.

**Why:** On-device inference competes with four video streams for CPU, memory bandwidth, and battery.

**How to apply:** Only run background generation when the player enables it, a model is loaded, and playback is active; keep batch sizes, open quest counts, and generation intervals bounded.

Continuous Pawstar chat is an explicit in-chat option and must stop generating when the chat overlay is hidden.

**Why:** The player asked for ongoing dialogue, but should remain in control of local-model activity and playback resources.

**How to apply:** Keep auto-chat off by default, generate one bounded message at a time on a cooldown, and stop on model errors.

When expanding persisted RPG state, accept known older save versions and initialize new mechanics without discarding existing progression.

**Why:** RPG progress is stored locally and must survive feature and app-version updates.

**How to apply:** Increment the RPG schema version deliberately and add migration tests for prior versions before changing the save parser.
