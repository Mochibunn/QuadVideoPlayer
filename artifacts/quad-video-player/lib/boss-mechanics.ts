/**
 * Pure boss encounter rules. The clock only advances through stepBoss, which the
 * overlay calls while the boss video is actually playing, so pauses freeze everything.
 */
export type BossAttackKind = 'sweep' | 'slam';
export type BossDefense = 'guard' | 'dodge';
export type BossPhase = 1 | 2 | 3;

export type BossState = {
  clockMs: number;
  hp: number;
  maxHp: number;
  phase: BossPhase;
  combo: number;
  focus: number;
  beatMs: number | null;
  difficulty: number;
  weakPeriodMs: number;
  weakWindowMs: number;
  nextWeakAt: number;
  weakOpenUntil: number;
  attack: { kind: BossAttackKind; startedAt: number; resolveAt: number } | null;
  nextAttackAt: number;
  counterUntil: number;
  stunnedUntil: number;
  defendLockUntil: number;
  skillReadyAt: number;
  spellReadyAt: number;
  counters: number;
  weakHits: number;
  event: string;
};

export const BOSS_MAX_FOCUS = 100;
export const BOSS_SKILL_COOLDOWN_MS = 2_000;
export const BOSS_SPELL_COOLDOWN_MS = 5_000;
const STUN_MS = 1_800;

export const requiredDefense: Record<BossAttackKind, BossDefense> = { sweep: 'dodge', slam: 'guard' };

/** Longer clips get a slightly busier boss; short clips stay forgiving. Range 0.8 to 1.35. */
export function bossDifficulty(remainingSeconds: number): number {
  const s = Number.isFinite(remainingSeconds) ? remainingSeconds : 0;
  return Math.round(Math.max(0.8, Math.min(1.35, 0.8 + ((s - 15) / 285) * 0.55)) * 100) / 100;
}

export function weakpointCycle(bpm: number | null): { period: number; window: number; beatMs: number | null } {
  if (bpm && bpm >= 40 && bpm <= 240) {
    const beatMs = 60_000 / bpm;
    const period = beatMs * (beatMs < 420 ? 4 : 2);
    return { period, window: Math.max(380, period * 0.42), beatMs };
  }
  return { period: 1_900, window: 720, beatMs: null };
}

export function attackIntervalMs(phase: BossPhase, difficulty: number): number {
  return Math.round((6_400 - phase * 900) / difficulty);
}

export function telegraphMs(phase: BossPhase, beatMs: number | null): number {
  const base = Math.max(1_000, 1_650 - phase * 170);
  if (!beatMs) return base;
  return Math.max(1_000, Math.round(base / beatMs) * beatMs);
}

export function createBossState(options: { maxHp: number; remainingSeconds: number; bpm: number | null }): BossState {
  const cycle = weakpointCycle(options.bpm);
  const difficulty = bossDifficulty(options.remainingSeconds);
  return {
    clockMs: 0, hp: options.maxHp, maxHp: options.maxHp, phase: 1, combo: 0, focus: BOSS_MAX_FOCUS,
    beatMs: cycle.beatMs, difficulty, weakPeriodMs: cycle.period, weakWindowMs: cycle.window,
    nextWeakAt: cycle.period, weakOpenUntil: 0, attack: null,
    nextAttackAt: Math.round(attackIntervalMs(1, difficulty) * 0.7),
    counterUntil: 0, stunnedUntil: 0, defendLockUntil: 0, skillReadyAt: 0, spellReadyAt: 0,
    counters: 0, weakHits: 0, event: 'The boss rises. Strike when its weak point glows.',
  };
}

export const isWeakOpen = (s: BossState) => s.clockMs < s.weakOpenUntil;
export const isStunned = (s: BossState) => s.clockMs < s.stunnedUntil;
export const hasCounter = (s: BossState) => s.clockMs < s.counterUntil;

function phaseFor(hp: number, maxHp: number): BossPhase {
  const ratio = maxHp > 0 ? hp / maxHp : 0;
  return ratio <= 1 / 3 ? 3 : ratio <= 2 / 3 ? 2 : 1;
}

function withDamage(s: BossState, damage: number, event: string): BossState {
  const hp = Math.max(0, s.hp - Math.max(0, Math.round(damage)));
  const phase = phaseFor(hp, s.maxHp);
  const phaseEvent = phase > s.phase && hp > 0
    ? `Phase ${phase}. The boss speeds up; weak points open ${phase === 3 ? 'for the last time' : 'faster'}.`
    : event;
  return { ...s, hp, phase: Math.max(s.phase, phase) as BossPhase, event: phaseEvent };
}

function failDefense(s: BossState, kind: BossAttackKind, reason: string): BossState {
  const loss = 20 + s.phase * 6;
  const focus = s.focus - loss;
  const stunned = focus <= 0;
  return {
    ...s,
    attack: null,
    combo: 0,
    focus: stunned ? 45 : focus,
    stunnedUntil: stunned ? s.clockMs + STUN_MS : s.stunnedUntil,
    nextAttackAt: s.clockMs + attackIntervalMs(s.phase, s.difficulty),
    event: stunned
      ? `The ${kind} knocks you off balance. Recovering focus...`
      : `${reason} Focus -${loss}, combo lost.`,
  };
}

/** Advances the encounter by dtMs of playing time. rng is injectable for tests. */
export function stepBoss(s: BossState, dtMs: number, rng: () => number = Math.random): BossState {
  if (s.hp <= 0 || dtMs <= 0) return s;
  const clockMs = s.clockMs + Math.min(dtMs, 1_000);
  let next: BossState = { ...s, clockMs };
  if (clockMs >= next.nextWeakAt) {
    const periodsMissed = Math.floor((clockMs - next.nextWeakAt) / next.weakPeriodMs);
    const openedAt = next.nextWeakAt + periodsMissed * next.weakPeriodMs;
    const phaseWindow = next.weakWindowMs * (next.phase === 3 ? 0.85 : 1);
    next = { ...next, weakOpenUntil: openedAt + phaseWindow, nextWeakAt: openedAt + next.weakPeriodMs };
  }
  if (next.attack && clockMs >= next.attack.resolveAt) {
    const kind = next.attack.kind;
    next = failDefense(next, kind, `The ${kind} connects.`);
  } else if (!next.attack && clockMs >= next.nextAttackAt && !isStunned(next)) {
    const kind: BossAttackKind = rng() < 0.5 ? 'sweep' : 'slam';
    next = {
      ...next,
      attack: { kind, startedAt: clockMs, resolveAt: clockMs + telegraphMs(next.phase, next.beatMs) },
      event: kind === 'sweep' ? 'Sweep incoming. Dodge!' : 'Slam incoming. Guard!',
    };
  }
  return next;
}

export function bossStrike(s: BossState): { state: BossState; damage: number } {
  if (s.hp <= 0) return { state: s, damage: 0 };
  if (isStunned(s)) return { state: { ...s, event: 'Still recovering. Hold on.' }, damage: 0 };
  const combo = s.combo + 1;
  let damage = 1 + Math.min(2, Math.floor(combo / 15));
  let label = `Strike · combo ${combo}`;
  let weakHits = s.weakHits;
  if (isWeakOpen(s)) { damage *= 3; weakHits += 1; label = `Weak point hit · x3 · combo ${combo}`; }
  let counterUntil = s.counterUntil;
  if (hasCounter(s)) { damage += 8 + s.phase * 2; counterUntil = 0; label = `Counterattack lands · combo ${combo}`; }
  return { state: withDamage({ ...s, combo, weakHits, counterUntil }, damage, label), damage };
}

export function bossDefend(s: BossState, defense: BossDefense): BossState {
  if (s.hp <= 0 || isStunned(s) || s.clockMs < s.defendLockUntil) return s;
  if (!s.attack) {
    return { ...s, defendLockUntil: s.clockMs + 650, event: `You ${defense} at nothing. Wait for the telegraph.` };
  }
  if (requiredDefense[s.attack.kind] !== defense) {
    return failDefense(s, s.attack.kind, `Wrong read: that ${s.attack.kind} needed ${requiredDefense[s.attack.kind]}.`);
  }
  return {
    ...s,
    attack: null,
    counters: s.counters + 1,
    focus: Math.min(BOSS_MAX_FOCUS, s.focus + 12),
    counterUntil: s.clockMs + 2_400,
    nextAttackAt: s.clockMs + attackIntervalMs(s.phase, s.difficulty),
    event: defense === 'guard' ? 'Perfect guard. Counter window open!' : 'Clean dodge. Counter window open!',
  };
}

export function bossAbility(
  s: BossState, kind: 'skill' | 'spell', power: number, name: string,
): { state: BossState; damage: number } {
  if (s.hp <= 0 || isStunned(s)) return { state: s, damage: 0 };
  const readyAt = kind === 'skill' ? s.skillReadyAt : s.spellReadyAt;
  if (s.clockMs < readyAt) return { state: s, damage: 0 };
  const base = kind === 'skill' ? 6 + power * 2 : 10 + power * 3;
  const damage = Math.round(base * (isWeakOpen(s) ? 1.5 : 1));
  const cooled = kind === 'skill'
    ? { ...s, skillReadyAt: s.clockMs + BOSS_SKILL_COOLDOWN_MS }
    : { ...s, spellReadyAt: s.clockMs + BOSS_SPELL_COOLDOWN_MS };
  return { state: withDamage(cooled, damage, `${name} deals ${damage}${isWeakOpen(s) ? ' into the weak point' : ''}.`), damage };
}
