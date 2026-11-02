export type ReleaseNote = {
  version: string;
  title: string;
  date: string;
  summary: string;
  changes: readonly string[];
};

export const RELEASE_NOTES: readonly ReleaseNote[] = [
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
