export const PLAYER_RPG_KEY = 'quad.player.rpg.v1';
export const PLAYER_RPG_VERSION = 3;
export const STREAK_QUALIFY_MS = 10 * 60_000;
export const DAILY_PLAYBACK_TARGET_MS = 15 * 60_000;
export const DAILY_VIDEO_TARGET = 4;
export const WEEKLY_ACTIVE_DAY_TARGET = 4;
export const SKILL_RANK_LIMIT = 3;
export const PET_XP_PER_LEVEL = 15;
export const streakRewards = [
  { days: 3, coins: 30 },
  { days: 7, coins: 75 },
  { days: 14, coins: 150 },
  { days: 30, coins: 300 },
] as const;

export type RpgSkillId = 'fortune' | 'bond' | 'bargain';
export type GoonQuestClassId = 'guardian' | 'arcanist' | 'ranger' | 'rogue';
export type RpgSkills = Record<RpgSkillId, number>;
export type StoryQuestObjective = 'defeats' | 'spells' | 'dungeons' | 'videos';
export type StoryQuest = {
  id: string;
  title: string;
  description: string;
  objective: StoryQuestObjective;
  progress: number;
  target: number;
  rewardCoins: number;
  claimed: boolean;
  createdAt: number;
};

export const storyQuestObjectiveOptions: {
  id: StoryQuestObjective;
  label: string;
  target: number;
  rewardCoins: number;
  unit: 'targets' | 'casts' | 'dungeons' | 'videos';
}[] = [
  { id: 'defeats', label: 'Send 4 flirty foes packing', target: 4, rewardCoins: 20, unit: 'targets' },
  { id: 'spells', label: 'Cast 3 spells with a teasing flourish', target: 3, rewardCoins: 20, unit: 'casts' },
  { id: 'dungeons', label: 'Clear an after-hours image dungeon', target: 1, rewardCoins: 30, unit: 'dungeons' },
  { id: 'videos', label: 'Watch 3 clips with your favorite familiar', target: 3, rewardCoins: 20, unit: 'videos' },
];

const STORY_QUEST_LIMIT = 10;

function cleanStoryText(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

export function createStoryQuest(
  id: string,
  objective: StoryQuestObjective,
  title: string,
  description: string,
  createdAt = Date.now(),
): StoryQuest | null {
  const config = storyQuestObjectiveOptions.find((item) => item.id === objective);
  const safeTitle = cleanStoryText(title, 64);
  const safeDescription = cleanStoryText(description, 280);
  if (!config || !/^story-[a-zA-Z0-9_-]{4,80}$/.test(id) || !safeTitle || !safeDescription) return null;
  return {
    id,
    title: safeTitle,
    description: safeDescription,
    objective,
    progress: 0,
    target: config.target,
    rewardCoins: config.rewardCoins,
    claimed: false,
    createdAt: Number.isSafeInteger(createdAt) && createdAt > 0 ? createdAt : Date.now(),
  };
}

export function parseStoryQuests(value: unknown): StoryQuest[] {
  if (!Array.isArray(value)) return [];
  const quests: StoryQuest[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const data = item as Record<string, unknown>;
    const config = storyQuestObjectiveOptions.find((option) => option.id === data.objective);
    if (!config || typeof data.id !== 'string' || !/^story-[a-zA-Z0-9_-]{4,80}$/.test(data.id)) continue;
    if (seen.has(data.id)) continue;
    const quest = createStoryQuest(
      data.id,
      config.id,
      cleanStoryText(data.title, 64),
      cleanStoryText(data.description, 280),
      typeof data.createdAt === 'number' ? data.createdAt : 0,
    );
    if (!quest) continue;
    quest.progress = Math.min(quest.target, clampInteger(data.progress, 0, quest.target));
    quest.claimed = data.claimed === true;
    seen.add(quest.id);
    quests.push(quest);
    if (quests.length >= STORY_QUEST_LIMIT) break;
  }
  return quests;
}

export function progressStoryQuests(
  quests: StoryQuest[],
  progress: Partial<Record<StoryQuestObjective, number>>,
): StoryQuest[] {
  let changed = false;
  const next = quests.map((quest) => {
    const amount = clampInteger(progress[quest.objective], 0, 10_000);
    if (!amount || quest.claimed || quest.progress >= quest.target) return quest;
    changed = true;
    return { ...quest, progress: Math.min(quest.target, quest.progress + amount) };
  });
  return changed ? next : quests;
}
export const goonQuestClasses: {
  id: GoonQuestClassId;
  name: string;
  role: string;
  skill: string;
  spell: string;
  skillDamage: number;
  spellDamage: number;
  areaSpell: boolean;
}[] = [
  { id: 'guardian', name: 'Moonfang Warden', role: 'Wolfkin defender who holds the den through every frenzy', skill: 'Pounce', spell: 'Lunar Roar', skillDamage: 2, spellDamage: 1, areaSpell: true },
  { id: 'arcanist', name: 'Foxfire Enchanter', role: 'Foxkin spellcaster with a talent for irresistible bursts', skill: 'Hexed Touch', spell: 'Starfall', skillDamage: 3, spellDamage: 2, areaSpell: false },
  { id: 'ranger', name: 'Wildpaw Stalker', role: 'Beastkin hunter with quick, precise strikes', skill: 'Scent Mark', spell: 'Moonlit Volley', skillDamage: 2, spellDamage: 1, areaSpell: true },
  { id: 'rogue', name: 'Slytail Trickster', role: 'Playful combo artist who loves a long, teasing game', skill: 'Tease and Strike', spell: 'Goonstorm', skillDamage: 2, spellDamage: 2, areaSpell: true },
];
export type RpgShopItem = {
  id: string;
  name: string;
  description: string;
  cost: number;
  icon: 'star' | 'moon' | 'heart';
  matureOnly?: boolean;
};

export const rpgSkills: { id: RpgSkillId; name: string; description: string }[] = [
  { id: 'fortune', name: 'Treasure Scent', description: 'Sniff out +10% more quest coins per rank.' },
  { id: 'bond', name: 'Pawbound Pact', description: 'Your beastkin familiar earns +25% XP per rank.' },
  { id: 'bargain', name: 'Den Trader', description: 'Charm the shopkeeper into −5% prices per rank.' },
];

export const rpgShopItems: RpgShopItem[] = [
  { id: 'pixel-crown', name: 'Starfang Crown', description: 'A moon-bright circlet for your loyal beastkin familiar.', cost: 40, icon: 'star' },
  { id: 'moon-charm', name: 'Moonpaw Collar', description: 'A velvet charm for private, late-night den rituals.', cost: 65, icon: 'moon' },
  {
    id: 'after-dark-charm',
    name: 'Gooner’s Velvet Collar',
    description: 'A velvet collar for an adult beastkin partner who enjoys consensual teasing and edging through a private goon session.',
    cost: 90,
    icon: 'heart',
    matureOnly: true,
  },
];

export type PlayerRpgState = {
  version: 3;
  dayKey: string;
  weekKey: string;
  todayPlaybackMs: number;
  todayVideoIds: string[];
  activeDayKeys: string[];
  lastQualifiedDayKey: string | null;
  currentStreak: number;
  bestStreak: number;
  claimedStreakRewardDays: number[];
  coins: number;
  skillPoints: number;
  skills: RpgSkills;
  petName: string;
  petXp: number;
  petXpRemainderMs: number;
  ownedItemIds: string[];
  equippedItemId: string | null;
  adultFlavorEnabled: boolean;
  claimedDailyQuestIds: string[];
  weeklyQuestClaimed: boolean;
  awardedLevel: number;
  classId: GoonQuestClassId;
  totalDefeated: number;
  defeatedToday: number;
  spellsToday: number;
  dungeonsToday: number;
  storyQuests: StoryQuest[];
};

export type RpgQuest = {
  id: string;
  title: string;
  adultTitle: string;
  description: string;
  progress: number;
  target: number;
  unit: 'min' | 'videos' | 'targets' | 'casts' | 'dungeons' | 'days';
  rewardCoins: number;
  claimed: boolean;
  weekly: boolean;
};

const allowedSkillIds = new Set<RpgSkillId>(['fortune', 'bond', 'bargain']);
const allowedItemIds = new Set(rpgShopItems.map((item) => item.id));

function clampInteger(value: unknown, fallback: number, max = 1_000_000_000): number {
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? Math.max(0, Math.min(max, value)) : fallback;
}

function isDayKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && localDayKey(date.getTime()) === value;
}

export function localDayKey(timestampMs: number): string {
  const date = new Date(timestampMs);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function localWeekKey(timestampMs: number): string {
  const date = new Date(timestampMs);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return localDayKey(date.getTime());
}

function previousDayKey(dayKey: string): string {
  const date = new Date(`${dayKey}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return localDayKey(date.getTime());
}

function listOfStrings(value: unknown, limit: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string =>
    typeof item === 'string' && item.length > 0 && item.length <= maxLength))].slice(-limit);
}

export function emptyPlayerRpgState(now = Date.now()): PlayerRpgState {
  return {
    version: PLAYER_RPG_VERSION,
    dayKey: localDayKey(now),
    weekKey: localWeekKey(now),
    todayPlaybackMs: 0,
    todayVideoIds: [],
    activeDayKeys: [],
    lastQualifiedDayKey: null,
    currentStreak: 0,
    bestStreak: 0,
    claimedStreakRewardDays: [],
    coins: 0,
    skillPoints: 0,
    skills: { fortune: 0, bond: 0, bargain: 0 },
    petName: 'Pawstar',
    petXp: 0,
    petXpRemainderMs: 0,
    ownedItemIds: [],
    equippedItemId: null,
    adultFlavorEnabled: false,
    claimedDailyQuestIds: [],
    weeklyQuestClaimed: false,
    awardedLevel: 1,
    classId: 'guardian',
    totalDefeated: 0,
    defeatedToday: 0,
    spellsToday: 0,
    dungeonsToday: 0,
    storyQuests: [],
  };
}

export function advancePlayerRpgDate(state: PlayerRpgState, now = Date.now()): PlayerRpgState {
  const dayKey = localDayKey(now);
  const weekKey = localWeekKey(now);
  if (dayKey === state.dayKey && weekKey === state.weekKey) return state;
  return {
    ...state,
    dayKey,
    weekKey,
    todayPlaybackMs: dayKey === state.dayKey ? state.todayPlaybackMs : 0,
    todayVideoIds: dayKey === state.dayKey ? state.todayVideoIds : [],
    claimedDailyQuestIds: dayKey === state.dayKey ? state.claimedDailyQuestIds : [],
    defeatedToday: dayKey === state.dayKey ? state.defeatedToday : 0,
    spellsToday: dayKey === state.dayKey ? state.spellsToday : 0,
    dungeonsToday: dayKey === state.dayKey ? state.dungeonsToday : 0,
    weeklyQuestClaimed: weekKey === state.weekKey ? state.weeklyQuestClaimed : false,
  };
}

export function parsePlayerRpg(raw: string | null, now = Date.now()): PlayerRpgState {
  if (!raw) return emptyPlayerRpgState(now);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('The RPG progress data is damaged.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The RPG progress data is damaged.');
  }
  const data = parsed as Record<string, unknown>;
  if (data.version !== 1 && data.version !== 2 && data.version !== PLAYER_RPG_VERSION) {
    throw new Error('The RPG progress format is not supported.');
  }
  const today = localDayKey(now);
  const week = localWeekKey(now);
  const validOwned = listOfStrings(data.ownedItemIds, rpgShopItems.length, 80)
    .filter((id) => allowedItemIds.has(id));
  const skills = data.skills && typeof data.skills === 'object' && !Array.isArray(data.skills)
    ? data.skills as Record<string, unknown> : {};
  const rawActiveDays = listOfStrings(data.activeDayKeys, 45, 10).filter(isDayKey).sort();
  const claimedStreakRewardDays = Array.isArray(data.claimedStreakRewardDays)
    ? [...new Set(data.claimedStreakRewardDays.filter((day): day is number =>
      typeof day === 'number' && streakRewards.some((reward) => reward.days === day)))].sort((a, b) => a - b)
    : [];
  const lastQualifiedDayKey = isDayKey(data.lastQualifiedDayKey) ? data.lastQualifiedDayKey : null;
  const equippedItemId = typeof data.equippedItemId === 'string' &&
    validOwned.includes(data.equippedItemId) ? data.equippedItemId : null;
  const rawName = typeof data.petName === 'string' ? data.petName.trim().slice(0, 24) : '';
  const state: PlayerRpgState = {
    version: PLAYER_RPG_VERSION,
    dayKey: today,
    weekKey: week,
    todayPlaybackMs: isDayKey(data.dayKey) && data.dayKey === today
      ? clampInteger(data.todayPlaybackMs, 0) : 0,
    todayVideoIds: isDayKey(data.dayKey) && data.dayKey === today
      ? listOfStrings(data.todayVideoIds, 2_000, 4096) : [],
    activeDayKeys: rawActiveDays,
    lastQualifiedDayKey,
    currentStreak: clampInteger(data.currentStreak, 0, 100_000),
    bestStreak: clampInteger(data.bestStreak, 0, 100_000),
    claimedStreakRewardDays,
    coins: clampInteger(data.coins, 0),
    skillPoints: clampInteger(data.skillPoints, 0, 100_000),
    skills: {
      fortune: allowedSkillIds.has('fortune') ? clampInteger(skills.fortune, 0, SKILL_RANK_LIMIT) : 0,
      bond: allowedSkillIds.has('bond') ? clampInteger(skills.bond, 0, SKILL_RANK_LIMIT) : 0,
      bargain: allowedSkillIds.has('bargain') ? clampInteger(skills.bargain, 0, SKILL_RANK_LIMIT) : 0,
    },
    petName: rawName || 'Pawstar',
    petXp: clampInteger(data.petXp, 0),
    petXpRemainderMs: clampInteger(data.petXpRemainderMs, 0, 59_999),
    ownedItemIds: validOwned,
    equippedItemId,
    adultFlavorEnabled: data.adultFlavorEnabled === true,
    claimedDailyQuestIds: isDayKey(data.dayKey) && data.dayKey === today
      ? listOfStrings(data.claimedDailyQuestIds, 8, 40) : [],
    weeklyQuestClaimed: data.weekKey === week && data.weeklyQuestClaimed === true,
    awardedLevel: Math.max(1, clampInteger(data.awardedLevel, 1, 1_000_000)),
    classId: goonQuestClasses.some((item) => item.id === data.classId)
      ? data.classId as GoonQuestClassId : 'guardian',
    totalDefeated: clampInteger(data.totalDefeated, 0),
    defeatedToday: data.dayKey === today ? clampInteger(data.defeatedToday, 0) : 0,
    spellsToday: data.dayKey === today ? clampInteger(data.spellsToday, 0) : 0,
    dungeonsToday: data.dayKey === today ? clampInteger(data.dungeonsToday, 0) : 0,
    storyQuests: parseStoryQuests(data.storyQuests),
  };
  if (equippedItemId && rpgShopItems.find((item) => item.id === equippedItemId)?.matureOnly &&
    !state.adultFlavorEnabled) {
    state.equippedItemId = null;
  }
  return state;
}

function qualifyDay(state: PlayerRpgState): PlayerRpgState {
  const today = state.dayKey;
  if (state.lastQualifiedDayKey === today) return state;
  const streak = state.lastQualifiedDayKey === previousDayKey(today) ? state.currentStreak + 1 : 1;
  const newlyReached = streakRewards.filter((reward) =>
    reward.days <= streak && !state.claimedStreakRewardDays.includes(reward.days));
  const streakCoins = newlyReached.reduce((total, reward) =>
    total + Math.floor(reward.coins * (1 + state.skills.fortune * 0.1)), 0);
  return {
    ...state,
    activeDayKeys: [...new Set([...state.activeDayKeys, today])].slice(-45),
    lastQualifiedDayKey: today,
    currentStreak: streak,
    bestStreak: Math.max(state.bestStreak, streak),
    claimedStreakRewardDays: [
      ...state.claimedStreakRewardDays,
      ...newlyReached.map((reward) => reward.days),
    ],
    coins: state.coins + streakCoins,
  };
}

export function addRpgPlaybackTime(state: PlayerRpgState, deltaMs: number, now = Date.now()): PlayerRpgState {
  const current = advancePlayerRpgDate(state, now);
  const safeDelta = clampInteger(deltaMs, 0, 60_000);
  if (safeDelta === 0) return current;
  let next: PlayerRpgState = {
    ...current,
    todayPlaybackMs: current.todayPlaybackMs + safeDelta,
  };
  const petWeightedMs = Math.round(safeDelta * (1 + current.skills.bond * 0.25));
  const petTotalMs = current.petXpRemainderMs + petWeightedMs;
  next = {
    ...next,
    petXp: current.petXp + Math.floor(petTotalMs / 60_000),
    petXpRemainderMs: petTotalMs % 60_000,
  };
  if (next.todayPlaybackMs >= STREAK_QUALIFY_MS) next = qualifyDay(next);
  return next;
}

export function recordRpgVideos(state: PlayerRpgState, ids: readonly string[], now = Date.now()): PlayerRpgState {
  const current = advancePlayerRpgDate(state, now);
  const known = new Set(current.todayVideoIds);
  for (const id of ids) {
    if (id && id.length <= 4096 && known.size < 2_000) known.add(id);
  }
  const newlyAdded = known.size - current.todayVideoIds.length;
  if (newlyAdded === 0) return current;
  return {
    ...current,
    todayVideoIds: [...known],
    storyQuests: progressStoryQuests(current.storyQuests, { videos: newlyAdded }),
  };
}

export function recordRpgCombat(
  state: PlayerRpgState,
  progress: { defeats?: number; spells?: number; dungeons?: number },
  now = Date.now(),
): PlayerRpgState {
  const current = advancePlayerRpgDate(state, now);
  const defeats = clampInteger(progress.defeats, 0, 1000);
  const spells = clampInteger(progress.spells, 0, 1000);
  const dungeons = clampInteger(progress.dungeons, 0, 100);
  if (!defeats && !spells && !dungeons) return current;
  return {
    ...current,
    totalDefeated: current.totalDefeated + defeats,
    defeatedToday: current.defeatedToday + defeats,
    spellsToday: current.spellsToday + spells,
    dungeonsToday: current.dungeonsToday + dungeons,
    coins: current.coins + defeats * 2 + dungeons * 20,
    storyQuests: progressStoryQuests(current.storyQuests, { defeats, spells, dungeons }),
  };
}

export function addRpgStoryQuest(state: PlayerRpgState, quest: StoryQuest): PlayerRpgState {
  const parsed = parseStoryQuests([quest])[0];
  if (!parsed || state.storyQuests.some((current) => current.id === parsed.id)) return state;
  const remaining = [...state.storyQuests];
  if (remaining.length >= STORY_QUEST_LIMIT) {
    const oldestClaimed = remaining.findIndex((item) => item.claimed);
    if (oldestClaimed < 0) return state;
    remaining.splice(oldestClaimed, 1);
  }
  return { ...state, storyQuests: [...remaining, parsed] };
}

export function setGoonQuestClass(state: PlayerRpgState, classId: GoonQuestClassId): PlayerRpgState {
  return goonQuestClasses.some((item) => item.id === classId) && state.classId !== classId
    ? { ...state, classId } : state;
}

export function weeklyActiveDayCount(state: PlayerRpgState, now = Date.now()): number {
  const weekKey = localWeekKey(now);
  const today = localDayKey(now);
  return state.activeDayKeys.filter((day) => day >= weekKey && day <= today).length;
}

export function currentRpgStreak(state: PlayerRpgState, now = Date.now()): number {
  const today = localDayKey(now);
  return state.lastQualifiedDayKey === today || state.lastQualifiedDayKey === previousDayKey(today)
    ? state.currentStreak : 0;
}

export function nextRpgStreakReward(state: PlayerRpgState, now = Date.now()) {
  const streak = currentRpgStreak(state, now);
  return streakRewards.find((reward) =>
    reward.days > streak && !state.claimedStreakRewardDays.includes(reward.days)) ?? null;
}

export function getRpgQuests(state: PlayerRpgState, now = Date.now()): RpgQuest[] {
  const current = advancePlayerRpgDate(state, now);
  const dailyQuests: RpgQuest[] = [
    {
      id: 'daily-focus',
      title: current.adultFlavorEnabled ? 'Gooner’s focus ritual' : 'Gooning focus ritual',
      adultTitle: 'Gooner’s focus ritual',
      description: current.adultFlavorEnabled
        ? 'Masturbate through a 15-minute goon session; edge yourself without pausing the den.'
        : 'Keep your den session going for 15 active minutes today.',
      progress: Math.min(15, Math.floor(current.todayPlaybackMs / 60_000)),
      target: 15,
      unit: 'min',
      rewardCoins: 25,
      claimed: current.claimedDailyQuestIds.includes('daily-focus'),
      weekly: false,
    },
    {
      id: 'daily-explorer',
      title: current.adultFlavorEnabled ? 'Private den collection' : 'Paw-print collection',
      adultTitle: 'Private den collection',
      description: current.adultFlavorEnabled
        ? 'Queue 4 adult clips, then use your private collection to get yourself off.'
        : 'Play 4 different videos to keep the den collection fresh today.',
      progress: Math.min(DAILY_VIDEO_TARGET, current.todayVideoIds.length),
      target: DAILY_VIDEO_TARGET,
      unit: 'videos',
      rewardCoins: 20,
      claimed: current.claimedDailyQuestIds.includes('daily-explorer'),
      weekly: false,
    },
    {
      id: 'daily-hunter',
      title: current.adultFlavorEnabled ? 'Bouncing prey' : 'Bouncing beast hunt',
      adultTitle: 'Bouncing prey',
      description: current.adultFlavorEnabled
        ? 'Tap 5 bouncing adult pinups while stroking; keep the teasing game going between hits.'
        : 'Tap 5 bouncing image targets in your den today.',
      progress: Math.min(5, current.defeatedToday),
      target: 5,
      unit: 'targets',
      rewardCoins: 30,
      claimed: current.claimedDailyQuestIds.includes('daily-hunter'),
      weekly: false,
    },
    {
      id: 'daily-arcana',
      title: current.adultFlavorEnabled ? 'After-dark Gooncraft' : 'Gooncraft practice',
      adultTitle: 'After-dark Gooncraft',
      description: current.adultFlavorEnabled
        ? 'Cast 3 class skills while edging; hold your climax until the last spell lands.'
        : 'Cast 3 class skills or spells to keep your focus charged.',
      progress: Math.min(3, current.spellsToday),
      target: 3,
      unit: 'casts',
      rewardCoins: 25,
      claimed: current.claimedDailyQuestIds.includes('daily-arcana'),
      weekly: false,
    },
    {
      id: 'daily-dungeon',
      title: current.adultFlavorEnabled ? 'Velvet Den Delve' : 'Moonfang den delve',
      adultTitle: 'Velvet Den Delve',
      description: current.adultFlavorEnabled
        ? 'Clear all three image-dungeon waves before you come; no skipping the finale.'
        : 'Clear one image dungeon and handle the whole horde today.',
      progress: Math.min(1, current.dungeonsToday),
      target: 1,
      unit: 'dungeons',
      rewardCoins: 50,
      claimed: current.claimedDailyQuestIds.includes('daily-dungeon'),
      weekly: false,
    },
    {
      id: 'weekly-cadence',
      title: current.adultFlavorEnabled ? 'After-hours den regular' : 'Moonlit Gooner',
      adultTitle: 'After-hours den regular',
      description: current.adultFlavorEnabled
        ? `Keep your private goon sessions going on ${WEEKLY_ACTIVE_DAY_TARGET} different days this week.`
        : `Keep the den streak going on ${WEEKLY_ACTIVE_DAY_TARGET} days this week.`,
      progress: Math.min(WEEKLY_ACTIVE_DAY_TARGET, weeklyActiveDayCount(current, now)),
      target: WEEKLY_ACTIVE_DAY_TARGET,
      unit: 'days',
      rewardCoins: 70,
      claimed: current.weeklyQuestClaimed,
      weekly: true,
    },
  ];
  const storyQuests = current.storyQuests.map((quest): RpgQuest => {
    const objective = storyQuestObjectiveOptions.find((item) => item.id === quest.objective)!;
    return {
      id: quest.id,
      title: quest.title,
      adultTitle: quest.title,
      description: quest.description,
      progress: quest.progress,
      target: quest.target,
      unit: objective.unit,
      rewardCoins: quest.rewardCoins,
      claimed: quest.claimed,
      weekly: false,
    };
  });
  return [...dailyQuests, ...storyQuests];
}

export function canClaimRpgQuest(state: PlayerRpgState, questId: RpgQuest['id'], now = Date.now()): boolean {
  const quest = getRpgQuests(state, now).find((item) => item.id === questId);
  return !!quest && !quest.claimed && quest.progress >= quest.target;
}

export function claimRpgQuest(state: PlayerRpgState, questId: RpgQuest['id'], now = Date.now()): PlayerRpgState {
  const current = advancePlayerRpgDate(state, now);
  if (!canClaimRpgQuest(current, questId, now)) return current;
  const quest = getRpgQuests(current, now).find((item) => item.id === questId);
  if (!quest) return current;
  const reward = Math.floor(quest.rewardCoins * (1 + current.skills.fortune * 0.1));
  if (current.storyQuests.some((item) => item.id === questId)) {
    return {
      ...current,
      coins: current.coins + reward,
      storyQuests: current.storyQuests.map((item) =>
        item.id === questId ? { ...item, claimed: true } : item),
    };
  }
  return quest.weekly
    ? { ...current, coins: current.coins + reward, weeklyQuestClaimed: true }
    : { ...current, coins: current.coins + reward, claimedDailyQuestIds: [...current.claimedDailyQuestIds, questId] };
}

export function awardRpgSkillPoints(state: PlayerRpgState, level: number): PlayerRpgState {
  const currentLevel = Math.max(1, clampInteger(level, 1, 1_000_000));
  if (currentLevel <= state.awardedLevel) return state;
  const earned = currentLevel - state.awardedLevel;
  return { ...state, awardedLevel: currentLevel, skillPoints: state.skillPoints + earned };
}

export function upgradeRpgSkill(state: PlayerRpgState, skillId: RpgSkillId): PlayerRpgState {
  if (!allowedSkillIds.has(skillId) || state.skillPoints < 1 || state.skills[skillId] >= SKILL_RANK_LIMIT) return state;
  return {
    ...state,
    skillPoints: state.skillPoints - 1,
    skills: { ...state.skills, [skillId]: state.skills[skillId] + 1 },
  };
}

export function shopItemCost(state: PlayerRpgState, item: RpgShopItem): number {
  return Math.max(1, Math.ceil(item.cost * (1 - state.skills.bargain * 0.05)));
}

export function purchaseRpgItem(state: PlayerRpgState, itemId: string): PlayerRpgState {
  const item = rpgShopItems.find((candidate) => candidate.id === itemId);
  if (!item || state.ownedItemIds.includes(item.id) || (item.matureOnly && !state.adultFlavorEnabled)) return state;
  const cost = shopItemCost(state, item);
  if (state.coins < cost) return state;
  return {
    ...state,
    coins: state.coins - cost,
    ownedItemIds: [...state.ownedItemIds, item.id],
    equippedItemId: item.id,
  };
}

export function equipRpgItem(state: PlayerRpgState, itemId: string | null): PlayerRpgState {
  if (itemId === null) return { ...state, equippedItemId: null };
  const item = rpgShopItems.find((candidate) => candidate.id === itemId);
  if (!item || !state.ownedItemIds.includes(itemId) || (item.matureOnly && !state.adultFlavorEnabled)) return state;
  return { ...state, equippedItemId: itemId };
}

export function setAdultRewardFlavor(state: PlayerRpgState, enabled: boolean): PlayerRpgState {
  return {
    ...state,
    adultFlavorEnabled: enabled,
    equippedItemId: !enabled && rpgShopItems.find((item) => item.id === state.equippedItemId)?.matureOnly
      ? null : state.equippedItemId,
  };
}

export function renameRpgCompanion(state: PlayerRpgState, name: string): PlayerRpgState {
  const petName = name.trim().slice(0, 24);
  return { ...state, petName: petName || 'Pawstar' };
}
