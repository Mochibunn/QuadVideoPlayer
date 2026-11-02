/**
 * Paw Parry: a small wrist-motion reaction game driven by REAL watch gesture IDs.
 * Pure reducer — no timers, no randomness, no I/O — so it can be tested exactly.
 * GO cue: exactly one fresh swing inside the window. HOLD cue: no swing.
 * Results here never feed dungeon kills, coins, or XP.
 */
export type ParryMode = 'watch' | 'touch';
export type ParryCue = 'go' | 'hold';
export type ParryPhase = 'idle' | 'rest' | 'cue' | 'paused' | 'over';
export type PauseReason = 'user' | 'sensor' | null;
export type ParryOutcome = 'hit' | 'held' | 'miss' | 'flinch' | null;

export const PARRY_LIVES = 3;
export const REST_MS = 1_100;
export const GRACE_MS = 1_800;
export const GO_WINDOW_MS = 2_000;
export const HOLD_WINDOW_MS = 1_700;
export const MOTION_STALE_MS = 2_500;
export const PAW_PARRY_BEST_KEY = 'goon-quest.paw-parry.best.v1';

export type ParryState = {
  phase: ParryPhase;
  mode: ParryMode;
  pauseReason: PauseReason;
  round: number;
  score: number;
  combo: number;
  bestCombo: number;
  lives: number;
  cue: ParryCue | null;
  phaseEndsAt: number;
  /** Remaining ms of the phase that was interrupted by a pause. */
  frozenRemainingMs: number;
  frozenPhase: 'rest' | 'cue' | null;
  lastGestureId: string | null;
  resolved: boolean;
  outcome: ParryOutcome;
};

export type ParryEvent =
  | { type: 'start'; mode: ParryMode; now: number; gestureId: string | null }
  | { type: 'tick'; now: number }
  | { type: 'swing'; now: number; gestureId: string | null; source: ParryMode }
  | { type: 'sensor'; now: number; ok: boolean; gestureId: string | null }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number; gestureId: string | null }
  | { type: 'quit' };

export const initialParryState: ParryState = {
  phase: 'idle', mode: 'watch', pauseReason: null, round: 0, score: 0, combo: 0, bestCombo: 0,
  lives: PARRY_LIVES, cue: null, phaseEndsAt: 0, frozenRemainingMs: 0, frozenPhase: null,
  lastGestureId: null, resolved: false, outcome: null,
};

/** Deterministic cue order: first two rounds are GO, then a fixed-looking but varied mix. */
export function cueForRound(round: number): ParryCue {
  if (round < 2) return 'go';
  const h = Math.imul(round ^ 0x5bd1e995, 0x27d4eb2d) >>> 0;
  return (h >>> 7) % 10 < 3 ? 'hold' : 'go';
}

export function pointsForHit(combo: number): number {
  return 1 + Math.min(4, Math.floor(combo / 5));
}

export function isMotionFresh(
  motion: { connected: boolean; available: boolean; receivedAtMs: number | null } | null,
  now: number, maxAgeMs = MOTION_STALE_MS,
): boolean {
  if (!motion || !motion.connected || !motion.available || motion.receivedAtMs === null) return false;
  const age = now - motion.receivedAtMs;
  return age >= -1_000 && age <= maxAgeMs;
}

function startCue(state: ParryState, now: number): ParryState {
  const cue = cueForRound(state.round);
  return { ...state, phase: 'cue', cue, resolved: false, outcome: null,
    phaseEndsAt: now + (cue === 'go' ? GO_WINDOW_MS : HOLD_WINDOW_MS) };
}

function toRest(state: ParryState, now: number, ms = REST_MS): ParryState {
  if (state.lives <= 0) return { ...state, phase: 'over', cue: null };
  return { ...state, phase: 'rest', cue: null, round: state.round + 1, phaseEndsAt: now + ms };
}

function succeed(state: ParryState, outcome: 'hit' | 'held'): ParryState {
  const combo = state.combo + 1;
  return { ...state, resolved: true, outcome, combo, bestCombo: Math.max(state.bestCombo, combo),
    score: state.score + pointsForHit(state.combo) };
}

function fail(state: ParryState, outcome: 'miss' | 'flinch'): ParryState {
  return { ...state, resolved: true, outcome, combo: 0, lives: Math.max(0, state.lives - 1) };
}

export function parryReducer(state: ParryState, event: ParryEvent): ParryState {
  switch (event.type) {
    case 'start':
      // Baseline: whatever gesture already arrived before Start is ignored.
      return { ...initialParryState, mode: event.mode, phase: 'rest', round: 0,
        phaseEndsAt: event.now + GRACE_MS, lastGestureId: event.gestureId };
    case 'quit':
      return { ...initialParryState, mode: state.mode };
    case 'pause': {
      if (state.phase !== 'rest' && state.phase !== 'cue') return state;
      return { ...state, phase: 'paused', pauseReason: 'user', frozenPhase: state.phase,
        frozenRemainingMs: Math.max(0, state.phaseEndsAt - event.now) };
    }
    case 'resume': {
      if (state.phase !== 'paused') return state;
      // Re-baseline and restart from a grace rest; an unresolved cue is replayed, not judged.
      const replay = state.frozenPhase === 'cue' && !state.resolved;
      return { ...state, phase: 'rest', pauseReason: null, frozenPhase: null, cue: null, outcome: null,
        round: replay ? state.round : state.frozenPhase === 'cue' ? state.round + 1 : state.round,
        lastGestureId: event.gestureId ?? state.lastGestureId, phaseEndsAt: event.now + GRACE_MS };
    }
    case 'sensor': {
      if (state.mode !== 'watch') return state;
      if (!event.ok && (state.phase === 'rest' || state.phase === 'cue')) {
        return { ...state, phase: 'paused', pauseReason: 'sensor', frozenPhase: state.phase,
          frozenRemainingMs: Math.max(0, state.phaseEndsAt - event.now) };
      }
      if (event.ok && state.phase === 'paused' && state.pauseReason === 'sensor') {
        return parryReducer(state, { type: 'resume', now: event.now, gestureId: event.gestureId });
      }
      return state;
    }
    case 'swing': {
      if (event.source !== state.mode) return state;
      if (event.source === 'watch') {
        if (!event.gestureId || event.gestureId === state.lastGestureId) return state;
      }
      const next = event.source === 'watch' ? { ...state, lastGestureId: event.gestureId } : state;
      if (next.phase !== 'cue' || next.resolved) return next;
      return next.cue === 'go' ? succeed(next, 'hit') : fail(next, 'flinch');
    }
    case 'tick': {
      if (state.phase === 'rest' && event.now >= state.phaseEndsAt) return startCue(state, event.now);
      if (state.phase === 'cue') {
        if (state.resolved && event.now >= state.phaseEndsAt - (state.cue === 'go' ? GO_WINDOW_MS - 450 : 0)) {
          return toRest(state, event.now);
        }
        if (event.now >= state.phaseEndsAt) {
          const judged = state.resolved ? state : state.cue === 'go' ? fail(state, 'miss') : succeed(state, 'held');
          return toRest(judged, event.now);
        }
      }
      return state;
    }
    default:
      return state;
  }
}

export type ParryBests = { watch: number; touch: number };
export function parseParryBests(raw: string | null): ParryBests {
  try {
    const value = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    const n = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
    return { watch: n(value.watch), touch: n(value.touch) };
  } catch {
    return { watch: 0, touch: 0 };
  }
}
