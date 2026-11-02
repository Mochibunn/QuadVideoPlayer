export const XP_PER_MINUTE_MS = 60_000;
export const XP_PER_LEVEL = 10;
export const SESSION_MILESTONE_MS = 10 * 60_000;
export const ANIMATED_BORDER_LEVEL = 4;
export const ADVANCED_EQ_UNLOCK_LEVEL = 5;
export const PUZZLED_TEXTURE_SCALE_MIN = 0.5;
export const PUZZLED_TEXTURE_SCALE_MAX = 2.5;
export const PLAYER_REWARDS_KEY = 'quad.player.rewards.v1';

export const DEFAULT_CONGRATS_TEXT = [
  'Ten more minutes of stroking. Keep edging; your goon session is only getting hotter.',
  'Still hard, still focused, still going. The den can wait for your finish.',
  'Another milestone down. Keep your hand moving until you decide it is time to come.',
  'That long, filthy session is paying off. Take your reward and keep going.',
].join('\n');

export const borderOptions = [
  { id: 'gamecubed', name: 'GameCubed', unlockLevel: 1 },
  { id: 'arcade', name: 'Arcade Glow', unlockLevel: 2 },
  { id: 'puzzled', name: 'Puzzled', unlockLevel: 3 },
  { id: 'nebula', name: 'Nebula', unlockLevel: 4 },
  { id: 'prism', name: 'Prism', unlockLevel: 5 },
  { id: 'aurora', name: 'Aurora', unlockLevel: 6 },
  { id: 'pawprint', name: 'Pawprint Trail', unlockLevel: 1 },
] as const;

/** Border styles drawn from a repeating tile; they honour texture scale and scrolling. */
export const TEXTURED_BORDER_STYLES: readonly BorderStyleId[] = ['puzzled', 'pawprint'];
export function isTexturedBorder(id: BorderStyleId): boolean {
  return TEXTURED_BORDER_STYLES.includes(id);
}

export const themeUnlockLevels: Record<string, number> = {
  amethyst: 1,
  silver: 2,
  emerald: 2,
  coral: 3,
  sunflower: 3,
  'blue-hour': 4,
  'dusty-rose': 4,
  sage: 4,
  'soft-lilac': 4,
  'peach-fuzz': 5,
  'sea-glass': 5,
  periwinkle: 5,
  mocha: 5,
  'cherry-blossom': 6,
  arctic: 6,
  apricot: 6,
  'olive-mist': 6,
  'trans-pride': 1,
  'spectrum-calm': 1,
  'stim-garden': 1,
};

export const rewardMilestones = [
  { level: 2, description: 'Silver and Emerald themes · Arcade Glow border' },
  { level: 3, description: 'Coral and Sunflower themes · Puzzled border' },
  { level: 4, description: 'Soft pastel themes · Nebula border · animated borders' },
  { level: 5, description: 'Advanced EQ presets · Prism border' },
  { level: 6, description: 'Final pastel themes · Aurora border' },
] as const;

export type BorderStyleId = (typeof borderOptions)[number]['id'];
export const BORDER_DIRECTIONS = [
  'left', 'right', 'up', 'down', 'up-left', 'up-right', 'down-left', 'down-right',
] as const;
export type BorderDirection = (typeof BORDER_DIRECTIONS)[number];
const DIRECTION_ALIASES: Record<string, BorderDirection> = {
  nw: 'up-left', ne: 'up-right', sw: 'down-left', se: 'down-right',
  northwest: 'up-left', northeast: 'up-right', southwest: 'down-left', southeast: 'down-right',
  'left-up': 'up-left', 'right-up': 'up-right', 'left-down': 'down-left', 'right-down': 'down-right',
};
export function parseBorderDirection(value: unknown, fallback: BorderDirection = 'right'): BorderDirection {
  if (typeof value !== 'string') return fallback;
  const key = value.trim().toLowerCase();
  if ((BORDER_DIRECTIONS as readonly string[]).includes(key)) return key as BorderDirection;
  return DIRECTION_ALIASES[key] ?? fallback;
}
/** Unit-length travel vector (screen coords, +y is down). Diagonals are normalized. */
export function borderDirectionVector(direction: BorderDirection): { x: number; y: number } {
  const x = direction.includes('left') ? -1 : direction.includes('right') ? 1 : 0;
  const y = direction.includes('up') ? -1 : direction.includes('down') ? 1 : 0;
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}
export function clampTextureScale(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 1;
  return Math.round(Math.max(PUZZLED_TEXTURE_SCALE_MIN, Math.min(PUZZLED_TEXTURE_SCALE_MAX, n)) * 10) / 10;
}
export type PlayerRewardsSettings = {
  borderEnabled: boolean;
  borderStyle: BorderStyleId;
  scrollBorder: boolean;
  scrollDirection: BorderDirection;
  scrollSpeed: number;
  textureScale: number;
  congratsText: string;
  allRewardsUnlocked: boolean;
};

export const DEFAULT_PLAYER_REWARDS: PlayerRewardsSettings = {
  borderEnabled: false,
  borderStyle: 'gamecubed',
  scrollBorder: false,
  scrollDirection: 'right',
  scrollSpeed: 3,
  textureScale: 1,
  congratsText: DEFAULT_CONGRATS_TEXT,
  allRewardsUnlocked: false,
};

export function experienceForPlayback(totalPlaybackMs: number, activeSessionMs = 0): number {
  const total = Math.max(0, Number.isFinite(totalPlaybackMs) ? totalPlaybackMs : 0);
  const active = Math.max(0, Number.isFinite(activeSessionMs) ? activeSessionMs : 0);
  return Math.floor((total + active) / XP_PER_MINUTE_MS);
}

export function levelForExperience(xp: number): number {
  return Math.floor(Math.max(0, Number.isFinite(xp) ? xp : 0) / XP_PER_LEVEL) + 1;
}

export function experienceIntoLevel(xp: number): number {
  return Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0)) % XP_PER_LEVEL;
}

export function experienceUntilNextLevel(xp: number): number {
  return XP_PER_LEVEL - experienceIntoLevel(xp);
}

export function isBorderUnlocked(id: BorderStyleId, xp: number, allRewardsUnlocked = false): boolean {
  const option = borderOptions.find((item) => item.id === id);
  return !!option && (allRewardsUnlocked || levelForExperience(xp) >= option.unlockLevel);
}

export function isThemeUnlocked(id: string, xp: number, allRewardsUnlocked = false): boolean {
  const unlockLevel = themeUnlockLevels[id];
  return allRewardsUnlocked || (unlockLevel !== undefined && levelForExperience(xp) >= unlockLevel);
}

export function nextRewardMilestone(xp: number) {
  const level = levelForExperience(xp);
  return rewardMilestones.find((milestone) => level < milestone.level) ?? null;
}

export function nextSessionMilestone(elapsedMs: number, lastShownMs: number): number | null {
  const elapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  const lastShown = Math.max(0, Number.isFinite(lastShownMs) ? lastShownMs : 0);
  const reached = Math.floor(elapsed / SESSION_MILESTONE_MS) * SESSION_MILESTONE_MS;
  return reached >= SESSION_MILESTONE_MS && reached > lastShown ? reached : null;
}

export function messagesForCongratText(value: string): string[] {
  const messages = value.split(/\r?\n/)
    .map((line) => line.trim().slice(0, 140))
    .filter(Boolean)
    .slice(0, 8);
  return messages.length ? messages : ['Great work reaching this milestone!'];
}

export function congratulationsFor(text: string, milestoneMs: number): string {
  const messages = messagesForCongratText(text);
  const milestoneIndex = Math.max(0, Math.floor(milestoneMs / SESSION_MILESTONE_MS) - 1);
  return messages[milestoneIndex % messages.length];
}

export function parsePlayerRewards(raw: string | null): PlayerRewardsSettings {
  if (!raw) return { ...DEFAULT_PLAYER_REWARDS };
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('The border and celebration settings are damaged.');
  }
  const value = data as Record<string, unknown>;
  const direction = parseBorderDirection(value.scrollDirection, DEFAULT_PLAYER_REWARDS.scrollDirection);
  const borderStyle = borderOptions.some((item) => item.id === value.borderStyle)
    ? value.borderStyle as BorderStyleId : DEFAULT_PLAYER_REWARDS.borderStyle;
  const speed = typeof value.scrollSpeed === 'number' && Number.isFinite(value.scrollSpeed)
    ? Math.max(1, Math.min(10, value.scrollSpeed)) : DEFAULT_PLAYER_REWARDS.scrollSpeed;
  const textureScale = typeof value.textureScale === 'number' && Number.isFinite(value.textureScale)
    ? clampTextureScale(value.textureScale) : DEFAULT_PLAYER_REWARDS.textureScale;
  const congratsText = typeof value.congratsText === 'string'
    ? value.congratsText.slice(0, 1_000) : DEFAULT_PLAYER_REWARDS.congratsText;
  return {
    borderEnabled: typeof value.borderEnabled === 'boolean' ? value.borderEnabled : DEFAULT_PLAYER_REWARDS.borderEnabled,
    borderStyle, scrollBorder: typeof value.scrollBorder === 'boolean' ? value.scrollBorder : DEFAULT_PLAYER_REWARDS.scrollBorder,
    scrollDirection: direction, scrollSpeed: speed, textureScale, congratsText,
    allRewardsUnlocked: value.allRewardsUnlocked === true,
  };
}
