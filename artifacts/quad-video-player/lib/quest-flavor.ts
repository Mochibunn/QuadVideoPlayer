/** Playful, non-graphic fantasy flavor for the guild board and Paw Parry arcade. */

export const GUILD_TIPS = [
  'Guild tip: a tidy quiver is a fast quiver. Claim finished quests before the ledger fills up.',
  'Guild tip: set a clip tempo by hand — tap along in the beat forge or type the BPM.',
  'Guild tip: a boss hunt races its clip timer. Defeat the boss before the video ends.',
  'Guild tip: skills recover in two breaths, spells in five. Alternate them like a bard alternates verses.',
  'Guild tip: the frame forge lives in Settings → RPG & rewards. Texture scale works on Puzzled and Pawprint.',
  'Guild tip: diagonal frame drift is now on the compass. NW, NE, SW, SE — pick your breeze.',
  'Guild tip: Paw Parry is practice for reflexes only. It never touches your dungeon tally.',
  'Guild tip: strap the watch snug and keep swings small. Wrists, not windmills.',
] as const;

export const FAMILIAR_CHEERS = [
  '{pet} bumps your hand with a tiny forehead. "You are doing great, guildmate."',
  '{pet} polishes your boots with a sleeve. "Heroes deserve shiny boots."',
  '{pet} hums a marching tune and taps the board with one paw.',
  '{pet} has counted your coins twice. "Still yours. Still shiny."',
  '{pet} sketches a crown on the quest map and points at you.',
  '{pet} yawns, stretches, and declares it an excellent evening for adventure.',
] as const;

export const BATTLE_BARKS = {
  hit: ['Clean parry!', 'Paw-fect timing!', 'The rune sings!', 'Swift as a moth!', 'Ding! Guild bell rings.'],
  held: ['Steady paws.', 'Statue mode: flawless.', 'Patience is a spell too.', 'Not a whisker moved.'],
  miss: ['The rune fizzled — next one!', 'Too slow, the moth escaped.', 'Shake it off, guildmate.'],
  flinch: ['Whoa — HOLD meant hold!', 'The rune caught you twitching.', 'Easy, easy. Still paws.'],
} as const;

export const ARCADE_PROMPTS = {
  go: ['SWING!', 'FLICK!', 'PARRY!'],
  hold: ['HOLD STILL', 'FREEZE', 'STEADY'],
  rest: ['ready your paw…', 'breathe…', 'eyes on the rune…'],
} as const;

export const PAW_RANKS = [
  { min: 0, title: 'Kitten Cadet', paws: 1 },
  { min: 8, title: 'Whisker Squire', paws: 2 },
  { min: 20, title: 'Pawblade Adept', paws: 3 },
  { min: 40, title: 'Moonpaw Duelist', paws: 4 },
  { min: 70, title: 'Grand Parry Sovereign', paws: 5 },
] as const;

export function rankForParryScore(score: number) {
  let rank: (typeof PAW_RANKS)[number] = PAW_RANKS[0];
  for (const entry of PAW_RANKS) if (score >= entry.min) rank = entry;
  return rank;
}

/** Deterministic pick so lines rotate predictably instead of flickering. */
export function pickLine<T extends string>(lines: readonly T[], seed: number): T {
  const index = Math.abs(Math.floor(Number.isFinite(seed) ? seed : 0)) % lines.length;
  return lines[index];
}

export function familiarCheer(petName: string, seed: number): string {
  return pickLine(FAMILIAR_CHEERS, seed).replace('{pet}', petName.trim() || 'Your familiar');
}
