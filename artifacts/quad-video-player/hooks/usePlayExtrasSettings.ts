import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_PLAY_EXTRAS, parsePlayExtras, PLAY_EXTRAS_KEY,
  type PlayExtrasSettings,
} from '@/lib/play-extras';

export function usePlayExtrasSettings() {
  const [settings, setSettings] = useState(DEFAULT_PLAY_EXTRAS);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const writable = useRef(false);
  const writeQueue = useRef(Promise.resolve());

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(PLAY_EXTRAS_KEY).then((raw) => {
      if (!mounted) return;
      setSettings(parsePlayExtras(raw ? JSON.parse(raw) : null));
      writable.current = true;
    }).catch((reason) => {
      if (mounted) setError(reason instanceof Error ? reason.message : 'Could not load game audio settings.');
    }).finally(() => {
      if (mounted) setReady(true);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!ready || !writable.current) return;
    const snapshot = JSON.stringify(settings);
    writeQueue.current = writeQueue.current.catch(() => undefined).then(() =>
      AsyncStorage.setItem(PLAY_EXTRAS_KEY, snapshot)).catch((reason) => {
      writable.current = false;
      setError(reason instanceof Error ? reason.message : 'Could not save game audio settings.');
    });
  }, [ready, settings]);

  const update = useCallback((patch: Partial<PlayExtrasSettings>) => {
    setSettings((current) => parsePlayExtras({ ...current, ...patch }));
  }, []);

  const restore = useCallback((next: PlayExtrasSettings) => {
    if (!ready) return false;
    writable.current = true;
    setError('');
    setSettings(parsePlayExtras(next));
    return true;
  }, [ready]);

  return { settings, update, restore, ready, error };
}
