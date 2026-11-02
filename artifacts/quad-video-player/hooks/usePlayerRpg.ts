import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { levelForExperience } from '@/lib/player-rewards';
import {
  addRpgPlaybackTime, awardRpgSkillPoints, canClaimRpgQuest, claimRpgQuest,
  emptyPlayerRpgState, equipRpgItem, parsePlayerRpg, purchaseRpgItem,
  recordRpgCombat, recordRpgVideos, renameRpgCompanion, setAdultRewardFlavor, setGoonQuestClass, upgradeRpgSkill,
  PLAYER_RPG_KEY, type GoonQuestClassId, type PlayerRpgState, type RpgQuest, type RpgSkillId,
} from '@/lib/player-rpg';

export function usePlayerRpg(isPlaybackActive: boolean, xp: number, xpReady: boolean) {
  const [state, setState] = useState<PlayerRpgState>(() => emptyPlayerRpgState());
  const stateRef = useRef(state);
  const loadedRef = useRef(false);
  const writeQueue = useRef(Promise.resolve());
  const lastTickAt = useRef(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [, setClockTick] = useState(0);

  const commit = useCallback((transform: (current: PlayerRpgState) => PlayerRpgState) => {
    if (!loadedRef.current) return;
    const current = stateRef.current;
    const next = transform(current);
    if (next === current) return;
    stateRef.current = next;
    setState(next);
    const snapshot = JSON.stringify(next);
    writeQueue.current = writeQueue.current.catch(() => undefined).then(() =>
      AsyncStorage.setItem(PLAYER_RPG_KEY, snapshot)).catch((reason) => {
      setError(reason instanceof Error ? reason.message : 'RPG progress could not be saved.');
    });
  }, []);

  const reload = useCallback(async () => {
    loadedRef.current = false;
    setReady(false);
    try {
      const raw = await AsyncStorage.getItem(PLAYER_RPG_KEY);
      const next = parsePlayerRpg(raw, Date.now());
      stateRef.current = next;
      setState(next);
      setError('');
      loadedRef.current = true;
      setReady(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'RPG progress could not be loaded.');
      setReady(true);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!ready || error || !xpReady) return;
    commit((current) => awardRpgSkillPoints(current, levelForExperience(xp)));
  }, [commit, error, ready, xp, xpReady]);

  useEffect(() => {
    if (!ready || error || !isPlaybackActive) {
      lastTickAt.current = 0;
      return;
    }
    lastTickAt.current = Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      const delta = Math.min(60_000, Math.max(0, now - lastTickAt.current));
      lastTickAt.current = now;
      if (delta > 0) commit((current) => addRpgPlaybackTime(current, delta, now));
    }, 15_000);
    return () => clearInterval(interval);
  }, [commit, error, isPlaybackActive, ready]);

  useEffect(() => {
    const interval = setInterval(() => setClockTick((tick) => tick + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  const recordVideosWatched = useCallback((ids: readonly string[]) => {
    if (ids.length) commit((current) => recordRpgVideos(current, ids, Date.now()));
  }, [commit]);
  const recordCombat = useCallback((progress: { defeats?: number; spells?: number; dungeons?: number }) => {
    commit((current) => recordRpgCombat(current, progress, Date.now()));
  }, [commit]);
  const setClass = useCallback((classId: GoonQuestClassId) => {
    commit((current) => setGoonQuestClass(current, classId));
  }, [commit]);
  const replaceState = useCallback((next: PlayerRpgState) => {
    if (!loadedRef.current) return false;
    commit(() => next);
    return true;
  }, [commit]);
  const claimQuest = useCallback((id: RpgQuest['id']) => {
    let claimed = false;
    commit((current) => {
      claimed = canClaimRpgQuest(current, id, Date.now());
      return claimed ? claimRpgQuest(current, id, Date.now()) : current;
    });
    return claimed;
  }, [commit]);
  const upgradeSkill = useCallback((id: RpgSkillId) => {
    commit((current) => upgradeRpgSkill(current, id));
  }, [commit]);
  const buyItem = useCallback((id: string) => {
    commit((current) => purchaseRpgItem(current, id));
  }, [commit]);
  const equipItem = useCallback((id: string | null) => {
    commit((current) => equipRpgItem(current, id));
  }, [commit]);
  const setAdultFlavor = useCallback((enabled: boolean) => {
    commit((current) => setAdultRewardFlavor(current, enabled));
  }, [commit]);
  const renameCompanion = useCallback((name: string) => {
    commit((current) => renameRpgCompanion(current, name));
  }, [commit]);

  return {
    state,
    ready,
    error,
    retry: reload,
    recordVideosWatched,
    recordCombat,
    setClass,
    replaceState,
    claimQuest,
    upgradeSkill,
    buyItem,
    equipItem,
    setAdultFlavor,
    renameCompanion,
  };
}
