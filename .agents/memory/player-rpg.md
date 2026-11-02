---
name: Player RPG progression
description: User-requested gamification direction for Goon Quest.
---

The user wants daily quests and streaks, skill trees with passive perks, earnable currency and an item shop, a companion or pet, and a furry fantasy identity with playful lewd gooning themes. The mobile app is branded Goon Quest; preserve its Android package identity.

**Why:** The user wants Goon Quest centered on furry fantasy RPG content and gooning-themed adult humor.

**How to apply:** Keep progression, character flavor, rewards, and game copy aligned with this theme while keeping sexualized text non-graphic.

When expanding persisted RPG state, accept known older save versions and initialize new mechanics without discarding existing progression.

**Why:** RPG progress is stored locally and must survive feature and app-version updates.

**How to apply:** Increment the RPG schema version deliberately and add migration tests for prior versions before changing the save parser.
