export type ReleaseNote = {
  version: string;
  title: string;
  date: string;
  summary: string;
  changes: readonly string[];
};

export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    version: '1.18.5',
    title: 'Pawstar Escapes the Timer Trap',
    date: 'November 3, 2026',
    summary: 'A reliable auto-chat clock and clearer reports when a video refuses to play.',
    changes: [
      'Auto chat now starts immediately when the model is ready and repeats 30 seconds after each completed reply.',
      'Frequent session updates and changing callback references no longer reset the auto-chat deadline.',
      'Added a Details action to failed videos with file-access checks, video/audio track formats, advertised Android decoders, and a shareable report.',
      'Playback errors no longer assume that every failed file has an unsupported codec.',
      'Updated the watch companion package version while retaining its package identity and signing certificate.',
    ],
  },
  {
    version: '1.18.4',
    title: 'Yoster Yaps in Pill Mode',
    date: 'November 3, 2026',
    summary: 'Retro type, rounded watch controls, and a chatty familiar who can keep the conversation going.',
    changes: [
      'Applied Yoster across the game UI and Pixelta to major display headings.',
      'Rounded the Galaxy Watch controls into accessible pill buttons and matched the watch typography to the app.',
      'Added an opt-in Auto chat control that generates a new Pawstar line about every 30 seconds while chat is open.',
      'Moved chat keyboard handling to a keyboard-aware layout and strengthened input contrast, cursor visibility, and touch layering.',
    ],
  },
  {
    version: '1.18.3',
    title: 'Pawprint Pixel Pulse',
    date: 'November 3, 2026',
    summary: 'Fresh guild goals, a livelier heart-rate HUD, and a cleaner watch companion.',
    changes: [
      'Added lifetime video and Paw Parry win totals plus time-, video-, and mini-game achievements.',
      'Forge batches of local-AI achievements; optional, rate-limited background quest, honor, and cheer generation is off by default.',
      'The HUD can show lifetime video totals, and its heart icon pulses in time with a fresh live heart-rate reading.',
      'Added paw-border spacing control and raised the playback toolbar above the decorative frame.',
      'Added pixel-style game icons and a compact purple-and-black Galaxy Watch Link screen and launcher icon.',
      'Gave generated quests more after-hours fantasy flavor.',
    ],
  },
  {
    version: '1.18.2',
    title: 'Bubble Pop Bumper Pals',
    date: 'November 3, 2026',
    summary: 'Images and foes can now ricochet around the screen without stacking on top of each other.',
    changes: [
      'Added an optional Bubble collision mode in slideshow settings for bouncing slideshow images and combat enemies.',
      'Sprites collide with one another and reflect from screen edges; the mode is off by default.',
      'Collision mode temporarily replaces individual DVD bounce and AI-directed enemy paths; turn it off to restore them.',
    ],
  },
  {
    version: '1.18.1',
    title: 'Cheerful Pins & Paw Prints',
    date: 'November 3, 2026',
    summary: 'Fresh guild cheers get their turn, and progress pins are easier to find.',
    changes: [
      'Generated cheer notes now play before seed notes and appear in ten-minute milestone messages.',
      'The active minute cheer refreshes after generation without waiting for the next minute.',
      'Rewards settings show saved AI note counts and previews; generation remains manual with a loaded local model.',
      'Deduplicate generated notes, reject seed echoes and repeated batches, and retain older saved variations.',
      'Quest and honor progress controls have visible Pin/Pinned labels and larger touch targets.',
    ],
  },
  {
    version: '1.18.0',
    title: 'Chatty Paws & Rainbow Raids',
    date: 'November 3, 2026',
    summary: 'Pawstar joins your streams, bosses learn new tricks, and the guild gets a customizable HUD.',
    changes: [
      'Generate a chosen batch of quests sequentially with progress, cancellation, and journal-capacity checks.',
      'Talk to Pawstar in a compact video-friendly chat overlay using your loaded local model and editable role prompt.',
      'Added guild honors, model-forged tracked honors, and pinnable quest/honor progress above the videos.',
      'Record session and lifetime video totals, plus recorded heart-rate min/average/max; older history stays readable.',
      'Automatically scan up to 24 seconds of audio from each pool video, one decoder at a time, and cache BPM estimates.',
      'Beat/boss selectors now follow the actual current clips; fullscreen buttons work and hidden players remain paused.',
      'Boss fights now feature phases, timed weak points, telegraphed attacks, Guard/Dodge counters, focus, and paused-video freeze.',
      'Choose 1–12 simultaneous enemies per wave. Combat taps respond on touch-down and video controls are locked during fights.',
      'Ten-minute marks show an achievement pill and confetti; independent outlined full-width cheer text rotates every active minute.',
      'Generate more cheer lines from your own message seed using the loaded model, or switch minute text off separately.',
      'Timer, chat, and stats controls now live on the global toolbar. Customize transparent HUD metrics, color, size, and position.',
      'Added scrolling trans flag, trans paws, and trans puzzle frames, 0.5–6x texture scale, and adjustable frame thickness.',
      'Frames occupy dedicated layout gaps behind videos and controls instead of covering buttons or milestone popups.',
    ],
  },
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
