import type { CombatAiPlan, CombatMotion } from './combat-ai';

export const COMBAT_REQUEST_GAP_MS = 20_000;
export const TAG_HUNT_GAP_MS = 60_000;
export const MAX_RUN_TAGS = 3;
export const ENEMY_POOL_CAP = 80;
export const DEATH_SPEECH_MS = 5_000;
export const TAUNT_SPEECH_MS = 4_500;

export type DirectorClock = { inFlight: boolean; lastCompletedAt: number | null };
export type DirectorGate = {
  enabled: boolean; modelLoaded: boolean; storytellerBusy: boolean;
  paused: boolean; runActive: boolean; hasLiving: boolean;
};

/** Sampled inference: one request at a time, at least 20s after the previous one finished. */
export function canRequestPlan(clock: DirectorClock, gate: DirectorGate, now: number, cooldownMs = COMBAT_REQUEST_GAP_MS): boolean {
  if (!gate.enabled || !gate.modelLoaded || gate.storytellerBusy || gate.paused || !gate.runActive || !gate.hasLiving) return false;
  if (clock.inFlight) return false;
  return clock.lastCompletedAt === null || now - clock.lastCompletedAt >= Math.max(5_000, Math.min(120_000, cooldownMs));
}

/** Hard epoch: leave, new run, source change, unload, disable. Soft epoch: pause, run end. */
export type DirectorTicket = { runId: number; hardEpoch: number; softEpoch: number; actorIds: string[] };
export type DirectorLive = {
  runId: number; hardEpoch: number; softEpoch: number;
  living: ReadonlySet<string>; defeatedAt: ReadonlyMap<string, number>; now: number;
};
export type PlanResolution = {
  motions: Record<string, CombatMotion>;
  taunts: { enemyId: string; text: string }[];
  defeatLines: Record<string, string>;
  lateDefeats: { enemyId: string; text: string }[];
  tags: string[];
};

export function resolvePlan(plan: CombatAiPlan | null, ticket: DirectorTicket, live: DirectorLive): PlanResolution | null {
  if (!plan || ticket.runId !== live.runId || ticket.hardEpoch !== live.hardEpoch) return null;
  const fresh = ticket.softEpoch === live.softEpoch;
  const asked = new Set(ticket.actorIds);
  const result: PlanResolution = { motions: {}, taunts: [], defeatLines: {}, lateDefeats: [], tags: [] };
  for (const actor of plan.actors) {
    if (!asked.has(actor.id)) continue;
    if (actor.defeatLine) result.defeatLines[actor.id] = actor.defeatLine;
    if (live.living.has(actor.id)) {
      if (!fresh) continue;
      result.motions[actor.id] = actor.motion;
      if (actor.taunt) result.taunts.push({ enemyId: actor.id, text: actor.taunt });
    } else {
      const diedAt = live.defeatedAt.get(actor.id);
      if (diedAt !== undefined && live.now - diedAt < DEATH_SPEECH_MS && actor.defeatLine) {
        result.lateDefeats.push({ enemyId: actor.id, text: actor.defeatLine });
      }
    }
  }
  if (fresh) result.tags = plan.tags.slice(0, 2);
  return result;
}

export type HuntBudget = { accepted: string[]; lastHuntAt: number | null; inFlight: boolean };

export function nextHuntTag(candidates: string[], budget: HuntBudget, now: number): string | null {
  if (budget.inFlight || budget.accepted.length >= MAX_RUN_TAGS) return null;
  if (budget.lastHuntAt !== null && now - budget.lastHuntAt < TAG_HUNT_GAP_MS) return null;
  return candidates.find((tag) => !budget.accepted.includes(tag)) ?? null;
}

/** Add only new, unblocked images to the transient pool; never exceeds the cap. */
export function mergeHuntImages<T extends { uri: string; kind?: string }>(
  transient: T[], incoming: T[], known: ReadonlySet<string>, cap = ENEMY_POOL_CAP,
): T[] {
  const seen = new Set([...known, ...transient.map((item) => item.uri)]);
  const next = [...transient];
  for (const item of incoming) {
    if (next.length >= cap) break;
    if ((item.kind && item.kind !== 'image') || seen.has(item.uri)) continue;
    seen.add(item.uri);
    next.push(item);
  }
  return next.slice(0, cap);
}

export const AI_POOL_RESERVE = 24;
export const HUNT_TIMEOUT_MS = 15_000;

type SourceFingerprint = { id: string; kind: string; tags: string; excludeTags: string; safeOnly: boolean } | null;

/** Anything that changes this key invalidates pending AI work and transient run data. */
export function directorHardKey(aiEnabled: boolean, modelLoaded: boolean, source: SourceFingerprint): string {
  return JSON.stringify([aiEnabled, modelLoaded, source
    ? [source.id, source.kind, source.tags.trim(), source.excludeTags.trim(), source.safeOnly] : null]);
}

/** New run resets the tag budget; a source change in the same run keeps attempts spent. */
export function resetHuntBudget(budget: HuntBudget, reason: 'run' | 'source'): HuntBudget {
  return reason === 'run'
    ? { accepted: [], lastHuntAt: null, inFlight: false }
    : { accepted: [...budget.accepted], lastHuntAt: budget.lastHuntAt, inFlight: false };
}

/**
 * Combined spawn pool bounded at `cap`, de-duplicated by uri and preview. AI images keep
 * a reserved share so a full base pool never blocks newly hunted tags from spawning.
 */
export function combineEnemyPool<T extends { uri: string; preview?: string }>(
  base: T[], extras: T[], cap = ENEMY_POOL_CAP, reserve = AI_POOL_RESERVE,
): T[] {
  const seen = new Set<string>();
  const unique = (items: T[]) => items.filter((item) => {
    const keys = item.preview ? [item.uri, item.preview] : [item.uri];
    if (keys.some((key) => seen.has(key))) return false;
    keys.forEach((key) => seen.add(key));
    return true;
  });
  const baseUnique = unique(base);
  const extraUnique = unique(extras);
  const aiSlots = Math.min(extraUnique.length, Math.max(reserve, cap - baseUnique.length));
  return [...baseUnique.slice(0, cap - aiSlots), ...extraUnique.slice(0, aiSlots)];
}
