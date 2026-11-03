import type { PlayerRpgState } from '@/lib/player-rpg';

/**
 * Guild honors, pins, chat role, and extra combat counters live in their own key,
 * so the player-rpg save format is untouched and older saves keep loading.
 */
export const GUILD_LEDGER_KEY = 'goon-quest.guild-ledger.v1';
export const MAX_PINS = 6;
export const MAX_GENERATED_HONORS = 8;
export const MAX_CHAT_ROLE_LENGTH = 1_200;

export const DEFAULT_CHAT_ROLE = [
  'You are Pawstar, a quick-witted beastfolk familiar who chats with the player like a friendly stream companion.',
  'Reply in one or two short sentences, warm and playful, inside a cozy pixel-fantasy guild.',
].join(' ');

export type LedgerCounterKey =
  'bossVictories' | 'bossCounters' | 'weakpointHits' | 'dungeonClears' | 'spellsCast' | 'chatMessages' | 'questsForged';
export type HonorMetric = LedgerCounterKey | 'totalDefeated' | 'bestStreak' | 'awardedLevel' | 'petXp' | 'ownedItems';

export type GuildHonor = {
  id: string;
  title: string;
  description: string;
  metric: HonorMetric;
  target: number;
  /** Generated honors count progress from the value when they were written. */
  baseline?: number;
  generated?: boolean;
};

export type GuildLedger = {
  version: 1;
  counters: Record<LedgerCounterKey, number>;
  claimedHonorIds: string[];
  pinnedQuestIds: string[];
  pinnedHonorIds: string[];
  generatedHonors: GuildHonor[];
  chatRolePrompt: string;
};

const COUNTER_KEYS: LedgerCounterKey[] = [
  'bossVictories', 'bossCounters', 'weakpointHits', 'dungeonClears', 'spellsCast', 'chatMessages', 'questsForged',
];
const METRICS: HonorMetric[] = [...COUNTER_KEYS, 'totalDefeated', 'bestStreak', 'awardedLevel', 'petXp', 'ownedItems'];

export const metricLabels: Record<HonorMetric, string> = {
  bossVictories: 'boss victories', bossCounters: 'boss counters', weakpointHits: 'weak point hits',
  dungeonClears: 'den clears', spellsCast: 'skills and spells', chatMessages: 'chats with Pawstar',
  questsForged: 'quests forged', totalDefeated: 'enemies defeated', bestStreak: 'best streak days',
  awardedLevel: 'guild rank', petXp: 'familiar XP', ownedItems: 'items owned',
};

export const builtInHonors: GuildHonor[] = [
  { id: 'honor-first-boss', title: 'Clip Breaker', description: 'Defeat a video boss before its clip ends.', metric: 'bossVictories', target: 1 },
  { id: 'honor-five-boss', title: 'Colossus Tamer', description: 'Win five video boss fights.', metric: 'bossVictories', target: 5 },
  { id: 'honor-counter-10', title: 'Read the Telegraph', description: 'Land ten guard or dodge counters on bosses.', metric: 'bossCounters', target: 10 },
  { id: 'honor-weak-50', title: 'Beat Seeker', description: 'Strike fifty glowing weak points.', metric: 'weakpointHits', target: 50 },
  { id: 'honor-den-3', title: 'Den Regular', description: 'Clear the image den three times.', metric: 'dungeonClears', target: 3 },
  { id: 'honor-den-15', title: 'Den Warden', description: 'Clear the image den fifteen times.', metric: 'dungeonClears', target: 15 },
  { id: 'honor-spells-40', title: 'Moonlit Caster', description: 'Use skills or spells forty times.', metric: 'spellsCast', target: 40 },
  { id: 'honor-hunt-100', title: 'Hundred Pawprints', description: 'Defeat one hundred den enemies.', metric: 'totalDefeated', target: 100 },
  { id: 'honor-hunt-500', title: 'Portrait Wrangler', description: 'Defeat five hundred den enemies.', metric: 'totalDefeated', target: 500 },
  { id: 'honor-streak-7', title: 'Seven Moons', description: 'Reach a seven day guild streak.', metric: 'bestStreak', target: 7 },
  { id: 'honor-rank-10', title: 'Banner Bearer', description: 'Reach guild rank ten.', metric: 'awardedLevel', target: 10 },
  { id: 'honor-pet-60', title: 'Bonded Familiar', description: 'Raise your familiar to sixty XP.', metric: 'petXp', target: 60 },
  { id: 'honor-items-3', title: 'Well Outfitted', description: 'Own three items from the guild shop.', metric: 'ownedItems', target: 3 },
  { id: 'honor-chat-25', title: 'Fireside Talker', description: 'Trade twenty-five messages with Pawstar.', metric: 'chatMessages', target: 25 },
  { id: 'honor-forge-10', title: 'Story Forger', description: 'Forge ten storyteller quests.', metric: 'questsForged', target: 10 },
];

/** Generated honors pick a metric/target from this table; the model only writes the name. */
const GENERATED_GOALS: { metric: HonorMetric; target: number }[] = [
  { metric: 'totalDefeated', target: 30 },
  { metric: 'bossCounters', target: 4 },
  { metric: 'weakpointHits', target: 20 },
  { metric: 'spellsCast', target: 15 },
  { metric: 'dungeonClears', target: 2 },
  { metric: 'bossVictories', target: 1 },
  { metric: 'petXp', target: 15 },
];

export function emptyGuildLedger(): GuildLedger {
  return {
    version: 1,
    counters: Object.fromEntries(COUNTER_KEYS.map((key) => [key, 0])) as Record<LedgerCounterKey, number>,
    claimedHonorIds: [], pinnedQuestIds: [], pinnedHonorIds: [], generatedHonors: [], chatRolePrompt: DEFAULT_CHAT_ROLE,
  };
}

const cleanText = (value: unknown, max: number) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
const idList = (value: unknown, max: number) => Array.isArray(value)
  ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0 && item.length < 120))].slice(0, max)
  : [];
const safeCount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

function parseHonor(value: unknown): GuildHonor | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const id = cleanText(data.id, 80);
  const title = cleanText(data.title, 48);
  const description = cleanText(data.description, 160);
  const metric = METRICS.find((item) => item === data.metric);
  const target = safeCount(data.target);
  if (!id || !title || !description || !metric || target < 1) return null;
  return { id, title, description, metric, target, baseline: safeCount(data.baseline), generated: true };
}

export function parseGuildLedger(raw: string | null): GuildLedger {
  const empty = emptyGuildLedger();
  if (!raw) return empty;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return empty;
    const counters = (data.counters && typeof data.counters === 'object' ? data.counters : {}) as Record<string, unknown>;
    const role = cleanText(data.chatRolePrompt, MAX_CHAT_ROLE_LENGTH);
    return {
      version: 1,
      counters: Object.fromEntries(COUNTER_KEYS.map((key) => [key, safeCount(counters[key])])) as Record<LedgerCounterKey, number>,
      claimedHonorIds: idList(data.claimedHonorIds, 200),
      pinnedQuestIds: idList(data.pinnedQuestIds, MAX_PINS),
      pinnedHonorIds: idList(data.pinnedHonorIds, MAX_PINS),
      generatedHonors: (Array.isArray(data.generatedHonors) ? data.generatedHonors : [])
        .map(parseHonor).filter((item): item is GuildHonor => !!item).slice(0, MAX_GENERATED_HONORS),
      chatRolePrompt: role || DEFAULT_CHAT_ROLE,
    };
  } catch {
    return empty;
  }
}

export function metricValue(metric: HonorMetric, rpg: PlayerRpgState, ledger: GuildLedger): number {
  switch (metric) {
    case 'totalDefeated': return rpg.totalDefeated;
    case 'bestStreak': return Math.max(rpg.bestStreak, rpg.currentStreak);
    case 'awardedLevel': return rpg.awardedLevel;
    case 'petXp': return rpg.petXp;
    case 'ownedItems': return rpg.ownedItemIds.length;
    default: return ledger.counters[metric] ?? 0;
  }
}

export type HonorProgress = GuildHonor & { progress: number; ratio: number; complete: boolean; claimed: boolean };

export function evaluateGuildHonors(rpg: PlayerRpgState, ledger: GuildLedger): HonorProgress[] {
  return [...builtInHonors, ...ledger.generatedHonors].map((honor) => {
    const raw = metricValue(honor.metric, rpg, ledger) - (honor.baseline ?? 0);
    const progress = Math.max(0, Math.min(honor.target, raw));
    return {
      ...honor, progress, ratio: progress / honor.target, complete: progress >= honor.target,
      claimed: ledger.claimedHonorIds.includes(honor.id),
    };
  });
}

export function bumpLedgerCounter(ledger: GuildLedger, key: LedgerCounterKey, amount = 1): GuildLedger {
  if (!Number.isFinite(amount) || amount <= 0) return ledger;
  return { ...ledger, counters: { ...ledger.counters, [key]: ledger.counters[key] + Math.floor(amount) } };
}

export function claimGuildHonor(ledger: GuildLedger, rpg: PlayerRpgState, honorId: string): GuildLedger {
  const honor = evaluateGuildHonors(rpg, ledger).find((item) => item.id === honorId);
  if (!honor || !honor.complete || honor.claimed) return ledger;
  return {
    ...ledger,
    claimedHonorIds: [...ledger.claimedHonorIds, honorId],
    pinnedHonorIds: ledger.pinnedHonorIds.filter((id) => id !== honorId),
  };
}

export function togglePin(ledger: GuildLedger, kind: 'quest' | 'honor', id: string): GuildLedger {
  const key = kind === 'quest' ? 'pinnedQuestIds' : 'pinnedHonorIds';
  const list = ledger[key];
  if (list.includes(id)) return { ...ledger, [key]: list.filter((item) => item !== id) };
  if (list.length >= MAX_PINS) return ledger;
  return { ...ledger, [key]: [...list, id] };
}

/** Drops pins whose quest or honor no longer exists, so stale IDs never pile up. */
export function prunePins(ledger: GuildLedger, questIds: readonly string[], honorIds: readonly string[]): GuildLedger {
  const pinnedQuestIds = ledger.pinnedQuestIds.filter((id) => questIds.includes(id));
  const pinnedHonorIds = ledger.pinnedHonorIds.filter((id) => honorIds.includes(id));
  if (pinnedQuestIds.length === ledger.pinnedQuestIds.length && pinnedHonorIds.length === ledger.pinnedHonorIds.length) return ledger;
  return { ...ledger, pinnedQuestIds, pinnedHonorIds };
}

export function addGeneratedHonor(
  ledger: GuildLedger, rpg: PlayerRpgState, idea: { title: string; description: string }, id: string,
): GuildLedger | null {
  const title = cleanText(idea.title, 48);
  if (!title || !cleanText(idea.description, 160)) return null;
  const honors = [...ledger.generatedHonors];
  if (honors.length >= MAX_GENERATED_HONORS) {
    const index = honors.findIndex((honor) => ledger.claimedHonorIds.includes(honor.id));
    if (index < 0) return null;
    honors.splice(index, 1);
  }
  const goal = GENERATED_GOALS[(ledger.generatedHonors.length + ledger.claimedHonorIds.length) % GENERATED_GOALS.length];
  const description = `${cleanText(idea.description, 110)} Goal: ${goal.target} more ${metricLabels[goal.metric]}.`;
  return {
    ...ledger,
    generatedHonors: [...honors, {
      id, title, description, metric: goal.metric, target: goal.target,
      baseline: metricValue(goal.metric, rpg, ledger), generated: true,
    }],
  };
}

export function removeGeneratedHonor(ledger: GuildLedger, id: string): GuildLedger {
  return {
    ...ledger,
    generatedHonors: ledger.generatedHonors.filter((honor) => honor.id !== id),
    pinnedHonorIds: ledger.pinnedHonorIds.filter((item) => item !== id),
  };
}
