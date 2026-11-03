import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { Alert } from 'react-native';

// Keep writes ordered even if a screen unmounts and reopens during a save.
const queues = new Map<string, Promise<void>>();
export function writeSetting(key: string, value: unknown): Promise<void> {
  const snapshot = JSON.stringify(value);
  const next = (queues.get(key) ?? Promise.resolve()).catch(() => undefined)
    .then(() => AsyncStorage.setItem(key, snapshot));
  queues.set(key, next);
  void next.finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  }).catch(() => undefined);
  return next;
}

/** Hydrate before writing; persist every change, without a cancellable debounce. */
export function useSavedSetting<T>(key: string, initial: T, parse: (value: unknown) => T) {
  const [value, setValue] = useState(initial);
  const [ready, setReady] = useState(false);
  const edited = useRef(false);
  const parser = useRef(parse);
  parser.current = parse;
  useEffect(() => {
    let active = true;
    const pending = queues.get(key) ?? Promise.resolve();
    pending.catch(() => undefined).then(() => AsyncStorage.getItem(key)).then((raw) => {
      if (!active) return;
      if (raw !== null && !edited.current) setValue(parser.current(JSON.parse(raw)));
      setReady(true);
    }).catch(() => {
      if (active) Alert.alert('Settings could not be loaded',
        'Existing saved values have not been overwritten. Reopen the app to retry.');
    });
    return () => { active = false; };
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    void writeSetting(key, value).catch(() => {
      Alert.alert('Setting not saved', 'Your change is active, but local storage could not save it. Please check free space.');
    });
  }, [key, ready, value]);
  const update = useCallback((next: SetStateAction<T>) => {
    edited.current = true;
    setValue(next);
  }, []);
  return [value, update, ready] as const;
}
