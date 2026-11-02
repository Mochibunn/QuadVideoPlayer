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

**How to apply:** Keep active fights independent of quest-window visibility and preserve video touch controls outside enemy/HUD hit areas.

The local AI may direct enemy movement, give enemies taunts and defeat lines in nearby speech balloons, and automatically add enemy-search tags during fights. Profanity is allowed.

**Why:** The user explicitly requested autonomous in-fight tag additions and AI-driven movement/dialogue.

**How to apply:** Expose clear AI and automatic-search controls, preserve avoid-tags and source rating settings, bound movement and request rates, and discard stale responses after encounter changes.

The user wants more of a game feel, paw-themed fantasy cosmetics, and Wii-like mini-games driven by real watch movement.

**Why:** The user explicitly requested watch-motion mini-games alongside border improvements.

**How to apply:** Use actual watch sensors and the paired-phone relay; describe wrist gestures rather than claiming Wii-style positional tracking. Keep new flavor copy non-graphic.

When expanding persisted RPG state, accept known older save versions and initialize new mechanics without discarding existing progression.

**Why:** RPG progress is stored locally and must survive feature and app-version updates.

**How to apply:** Increment the RPG schema version deliberately and add migration tests for prior versions before changing the save parser.
