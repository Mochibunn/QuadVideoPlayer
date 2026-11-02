export type ReleaseNote = {
  version: string;
  title: string;
  date: string;
  summary: string;
  changes: readonly string[];
};

export const RELEASE_NOTES: readonly ReleaseNote[] = [
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
