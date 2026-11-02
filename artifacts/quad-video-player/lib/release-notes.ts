export type ReleaseNote = {
  version: string;
  title: string;
  date: string;
  summary: string;
  changes: readonly string[];
};

export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    version: '1.17.0',
    title: 'Paw Parry Patrol',
    date: 'November 2, 2026',
    summary: 'Better frames, diagonal textures, and a watch-powered paw arcade.',
    changes: [
      'Fixed Puzzled texture coverage at the left edge and quarter dividers, with frame layout matching single/quad video mode.',
      'Borders settings expose texture scaling and eight scroll directions, including all four diagonals.',
      'Added paw-themed cosmetics and more playful, non-graphic fantasy RPG flavor.',
      'The watch Link app can independently start wrist controls using real acceleration data without the Samsung heart-rate SDK.',
      'Wrist movements travel through your paired phone bridge to the tablet; stale or disconnected readings cannot score hits.',
      'Update the app on both phone and tablet, plus Goon Quest Link on the watch, for the motion mini-game.',
      'Use small wrist movements, secure your strap, leave room around you, and stop wrist controls when finished.',
      'Watch wrist controls stop after 15 minutes for battery safety; heart-rate tracking is unaffected.',
    ],
  },
  {
    version: '1.16.0',
    title: 'Puppet Paws & Tag Goblins',
    date: 'November 2, 2026',
    summary: 'Your local model can direct enemies, give them a voice, and hunt for new tags.',
    changes: [
      'Enable the AI enemy director to choose bounded movement styles, speed, and destinations from your loaded GGUF model.',
      'Enemy taunts and defeat lines appear in nearby speech balloons, with optional profanity.',
      'Opt into automatic tag hunts during fights: temporary enemy searches retain your source rating and avoid-tag filters.',
      'Automatic searches are paced and limited per encounter, do not overwrite saved searches, and add images for future spawns.',
      'Pause, leave, disable AI, or unload the model to stop new director actions; stale responses cannot revive enemies.',
      'No model loaded? Normal randomized combat remains available without pretending to be AI-controlled.',
    ],
  },
  {
    version: '1.15.0',
    title: 'Portraits Gone Rogue',
    date: 'November 2, 2026',
    summary: 'The enemies escaped the quest board and now roam above your videos.',
    changes: [
      'Fight larger enemy portraits directly over single or quad video playback, with compact skill and spell controls.',
      'Enemy movement varies its path, speed, pauses, and tilt independently, with BPM pulses and pixel hit feedback.',
      'Open and close the quest board without abandoning a run; pausing playback also freezes combat and wave progression.',
      'Failed enemy images are hidden and replaced; unavailable images cannot grant a dungeon-clear reward.',
      'Ask your loaded local GGUF model for enemy tag ideas in Online sources.',
      'Review suggested tags before adding them or fetching separate enemy searches; avoid-tags and safe-rating filters stay intact.',
      'Includes the Sensor Sprout Rescue watch permission repair.',
    ],
  },
  {
    version: '1.14.1',
    title: 'Sensor Sprout Rescue',
    date: 'November 2, 2026',
    summary: 'A watch companion repair for heart-rate tracking startup.',
    changes: [
      'The watch checks sensor permissions using both its Android version and the app target version.',
      'Android 16 watches no longer require nonexistent extra permissions before tracking can start.',
      'Startup failures and Samsung sensor error codes remain visible instead of being replaced with generic permission advice.',
      'The watch status screen scrolls and shows the companion version plus current permission states.',
      'This watch-only update works with the existing 1.14.0 tablet APK.',
    ],
  },
  {
    version: '1.14.0',
    title: 'Paws, Pixels & Prompt Potions',
    date: 'November 2, 2026',
    summary: 'A pixel-fantasy rebrand, a local storyteller, and a new stylus combat option.',
    changes: [
      'Meet the new pixel familiar, with RGB magic around the GameCubed violet theme.',
      'Import a GGUF model to write companion dialogue and quests entirely on-device.',
      'Generated quests use real tracked goals for enemy defeats, spell casts, dungeon clears, or watched videos.',
      'Edit the storyteller prompt and optionally enable AI-written enemy reactions.',
      'Enable S Pen combat taps while keeping the rest of the game’s touch controls available.',
    ],
  },
];

export const CURRENT_UPDATE = RELEASE_NOTES[0];
