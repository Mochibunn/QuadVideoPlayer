import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  emptyViewingSessions, finishViewingSession, parseViewingSessions, recoverViewingSessions,
  VIEWING_ACHIEVEMENT_MS, type FinishedViewingSession,
  VIEWING_SESSIONS_KEY, type ViewingSessionStore,
} from '@/lib/viewing-sessions';

export function useViewingSessions(isPlaybackActive: boolean) {
  const [store, setStore] = useState(emptyViewingSessions);
  const storeRef = useRef(store);
  const loadedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [celebration, setCelebration] = useState<number | null>(null);
  const [finishRecap, setFinishRecap] = useState<FinishedViewingSession | null>(null);
  const operations = useRef<Promise<void>>(Promise.resolve());
  const lastCheckpoint = useRef(0);

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
      return result;
    });
    operations.current = operation.then(
      () => undefined,
      (reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Playback history could not be saved.');
      },
    );
    return operation;
  }, []);
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
      setError('');
      loadedRef.current = true;
      setReady(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Playback history could not be read.');
      setReady(true);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!ready || error || !isPlaybackActive) return;
    void mutate((current) => {
      if (current.active?.resumedAtMs !== null && current.active) return current;
      const now = Date.now();
      lastCheckpoint.current = now;
      return { ...current, active: current.active
        ? { ...current.active, resumedAtMs: now, lastCheckpointMs: now }
        : { id: Crypto.randomUUID(), startedAtMs: now, elapsedMs: 0, resumedAtMs: now, lastCheckpointMs: now } };
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
      if (active?.resumedAtMs !== null && active &&
        now - Math.max(active.lastCheckpointMs, lastCheckpoint.current) >= 15_000) {
        lastCheckpoint.current = now;
        void mutate((current) => current.active?.resumedAtMs !== null && current.active
          ? { ...current, active: { ...current.active, lastCheckpointMs: now } } : current);
      }
    }, 2_000);
    return () => clearInterval(interval);
  }, [error, isPlaybackActive, mutate, ready]);

  const finishSession = useCallback(async () => {
    const finished = await commit((current) => {
      const result = finishViewingSession(current, Date.now());
      return { store: result.store, result: result.completed };
    });
    if (finished) {
      setFinishRecap(finished);
      if (finished.durationMs >= VIEWING_ACHIEVEMENT_MS) setCelebration(finished.durationMs);
    }
  }, [commit]);

  return { store, ready, error, celebration, setCelebration, finishRecap, setFinishRecap, finishSession, retryStorage: reload };
}
