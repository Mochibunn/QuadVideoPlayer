import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  elapsedViewingTime, emptyViewingSessions, finishViewingSession, parseViewingSessions,
  recordWatchedVideos as applyWatchedVideos, recoverViewingSessions,
  VIEWING_ACHIEVEMENT_MS, VIEWING_SESSIONS_KEY, type FinishedViewingSession, type ViewingSessionStore,
} from '@/lib/viewing-sessions';
import { experienceForPlayback, nextSessionMilestone, SESSION_MILESTONE_MS } from '@/lib/player-rewards';

export function useViewingSessions(isPlaybackActive: boolean) {
  const [store, setStore] = useState(emptyViewingSessions);
  const storeRef = useRef(store);
  const loadedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [celebration, setCelebration] = useState<number | null>(null);
  const [milestone, setMilestone] = useState<number | null>(null);
  const [xp, setXp] = useState(0);
  const xpRef = useRef(0);
  const lastMilestone = useRef({ sessionId: '', elapsedMs: 0 });
  const [finishRecap, setFinishRecap] = useState<FinishedViewingSession | null>(null);
  const operations = useRef<Promise<void>>(Promise.resolve());
  const lastCheckpoint = useRef(0);

  const syncXp = useCallback((current: ViewingSessionStore, now: number) => {
    const activeMs = current.active ? elapsedViewingTime(current.active, now) : 0;
    const nextXp = experienceForPlayback(current.totalPlaybackMs, activeMs);
    if (nextXp !== xpRef.current) {
      xpRef.current = nextXp;
      setXp(nextXp);
    }
  }, []);

  const commit = useCallback(<Result,>(
    update: (current: ViewingSessionStore) => { store: ViewingSessionStore; result: Result },
  ): Promise<Result> => {
    const operation = operations.current.catch(() => undefined).then(async () => {
      if (!loadedRef.current) throw new Error('Playback history is still loading.');
      const current = storeRef.current;
      const { store: next, result } = update(current);
      if (next !== current) {
        await AsyncStorage.setItem(VIEWING_SESSIONS_KEY, JSON.stringify(next));
        storeRef.current = next;
        setStore(next);
        setError('');
      }
      syncXp(next, Date.now());
      return result;
    });
    operations.current = operation.then(
      () => undefined,
      (reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Playback history could not be saved.');
      },
    );
    return operation;
  }, [syncXp]);
  const mutate = useCallback((update: (current: ViewingSessionStore) => ViewingSessionStore) =>
    commit((current) => ({ store: update(current), result: undefined })), [commit]);

  const reload = useCallback(async () => {
    loadedRef.current = false;
    setReady(false);
    try {
      const raw = await AsyncStorage.getItem(VIEWING_SESSIONS_KEY);
      const current = recoverViewingSessions(parseViewingSessions(raw), Date.now());
      if (JSON.stringify(current) !== JSON.stringify(parseViewingSessions(raw))) {
        await AsyncStorage.setItem(VIEWING_SESSIONS_KEY, JSON.stringify(current));
      }
      storeRef.current = current;
      setStore(current);
      syncXp(current, Date.now());
      lastMilestone.current = current.active ? {
        sessionId: current.active.id,
        elapsedMs: Math.floor(current.active.elapsedMs / SESSION_MILESTONE_MS) * SESSION_MILESTONE_MS,
      } : { sessionId: '', elapsedMs: 0 };
      setMilestone(null);
      setError('');
      loadedRef.current = true;
      setReady(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Playback history could not be read.');
      setReady(true);
    }
  }, [syncXp]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!ready || error || !isPlaybackActive) return;
    void mutate((current) => {
      if (current.active?.resumedAtMs !== null && current.active) return current;
      const now = Date.now();
      lastCheckpoint.current = now;
      return { ...current, active: current.active
        ? { ...current.active, resumedAtMs: now, lastCheckpointMs: now }
        : { id: Crypto.randomUUID(), startedAtMs: now, elapsedMs: 0, resumedAtMs: now,
          lastCheckpointMs: now, watchedVideoIds: [] } };
    });
  }, [error, isPlaybackActive, mutate, ready]);

  useEffect(() => {
    if (!ready || error || isPlaybackActive) return;
    void mutate((current) => {
      const active = current.active;
      if (!active || active.resumedAtMs === null) return current;
      const now = Date.now();
      lastCheckpoint.current = now;
      return { ...current, active: { ...active,
        elapsedMs: active.elapsedMs + Math.max(0, now - active.resumedAtMs),
        resumedAtMs: null, lastCheckpointMs: now } };
    });
  }, [error, isPlaybackActive, mutate, ready]);

  useEffect(() => {
    if (!ready || error || !isPlaybackActive) return;
    const interval = setInterval(() => {
      const active = storeRef.current.active;
      const now = Date.now();
      syncXp(storeRef.current, now);
      if (active && active.resumedAtMs !== null) {
        if (lastMilestone.current.sessionId !== active.id) {
          lastMilestone.current = {
            sessionId: active.id,
            elapsedMs: Math.floor(active.elapsedMs / SESSION_MILESTONE_MS) * SESSION_MILESTONE_MS,
          };
        }
        const elapsedMs = elapsedViewingTime(active, now);
        const reached = nextSessionMilestone(elapsedMs, lastMilestone.current.elapsedMs);
        if (reached !== null) {
          lastMilestone.current = { sessionId: active.id, elapsedMs: reached };
          setMilestone(reached);
        }
      }
      if (active?.resumedAtMs !== null && active &&
        now - Math.max(active.lastCheckpointMs, lastCheckpoint.current) >= 15_000) {
        lastCheckpoint.current = now;
        void mutate((current) => current.active?.resumedAtMs !== null && current.active
          ? { ...current, active: { ...current.active, lastCheckpointMs: now } } : current);
      }
    }, 2_000);
    return () => clearInterval(interval);
  }, [error, isPlaybackActive, mutate, ready, syncXp]);

  const finishSession = useCallback(async () => {
    const finished = await commit((current) => {
      const result = finishViewingSession(current, Date.now());
      return { store: result.store, result: result.completed };
    });
    if (finished) {
      setFinishRecap(finished);
      setMilestone(null);
      if (finished.durationMs >= VIEWING_ACHIEVEMENT_MS) setCelebration(finished.durationMs);
    }
  }, [commit]);

  const recordVideosWatched = useCallback((ids: readonly string[]) =>
    mutate((current) => applyWatchedVideos(current, ids)), [mutate]);

  const restoreStore = useCallback(async (next: ViewingSessionStore) => {
    if (!loadedRef.current) return false;
    const now = Date.now();
    const restored: ViewingSessionStore = {
      ...next,
      active: next.active ? { ...next.active, resumedAtMs: null, lastCheckpointMs: now } : null,
    };
    const operation = operations.current.catch(() => undefined).then(async () => {
      await AsyncStorage.setItem(VIEWING_SESSIONS_KEY, JSON.stringify(restored));
      storeRef.current = restored;
      setStore(restored);
      setError('');
      setFinishRecap(null);
      setCelebration(null);
      setMilestone(null);
      syncXp(restored, now);
    });
    operations.current = operation.catch(() => undefined);
    await operation;
    return true;
  }, [syncXp]);

  return { store, ready, error, celebration, setCelebration, milestone, setMilestone, xp, finishRecap,
    setFinishRecap, finishSession, recordVideosWatched, restoreStore, retryStorage: reload };
}
