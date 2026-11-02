import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_PLAYER_REWARDS, PLAYER_REWARDS_KEY, parsePlayerRewards,
  type PlayerRewardsSettings,
} from '@/lib/player-rewards';

export function usePlayerRewardsSettings() {
  const [settings, setSettings] = useState(DEFAULT_PLAYER_REWARDS);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const writable = useRef(false);
  const writeQueue = useRef(Promise.resolve());

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(PLAYER_REWARDS_KEY)
      .then((raw) => {
        if (!mounted) return;
        setSettings(parsePlayerRewards(raw));
        writable.current = true;
      })
      .catch((reason) => {
        if (mounted) setError(reason instanceof Error ? reason.message : 'Could not read border settings.');
      })
      .finally(() => { if (mounted) setReady(true); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!ready || !writable.current || error) return;
    const snapshot = JSON.stringify(settings);
    const timer = setTimeout(() => {
      writeQueue.current = writeQueue.current.catch(() => undefined).then(() =>
        AsyncStorage.setItem(PLAYER_REWARDS_KEY, snapshot)).catch((reason) => {
        writable.current = false;
        setError(reason instanceof Error ? reason.message : 'Could not save border settings.');
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [error, ready, settings]);

  const update = useCallback((patch: Partial<PlayerRewardsSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  return { settings, update, ready, error };
}
