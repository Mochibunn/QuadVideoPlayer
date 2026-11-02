---
name: Player RPG progression
description: User-requested gamification direction for Goon Quest.
---

The user wants daily quests and streaks, skill trees with passive perks, earnable currency and an item shop, a companion or pet, and a furry fantasy identity with graphic adult gooning themes. Goon Quest is an adult-only game; preserve its Android package identity.

**Why:** The user explicitly clarified that graphic adult writing is welcome because Goon Quest is adult-only.

**How to apply:** Use explicit sexual writing when it fits the game; portray sexualized characters as adults and make interactions consensual.

When expanding persisted RPG state, accept known older save versions and initialize new mechanics without discarding existing progression.

**Why:** RPG progress is stored locally and must survive feature and app-version updates.

**How to apply:** Increment the RPG schema version deliberately and add migration tests for prior versions before changing the save parser.
