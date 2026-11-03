import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { BPM_CACHE_KEY, parseBpmCache, type BpmCache, type CachedVideoBpm } from '@/lib/bpm-cache';
import { analyzeVideoBpm } from '@/lib/media-bpm';
import type { VideoAsset } from '@/lib/video-playback';

export function useAutomaticVideoBpm(pool: VideoAsset[], active: VideoAsset[]) {
  const [cache, setCache] = useState<BpmCache>({});
  const cacheRef = useRef(cache);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [analyzing, setAnalyzing] = useState('');
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [revision, setRevision] = useState(0);
  const writable = useRef(false);
  const generation = useRef(0);
  const alive = useRef(true);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const library = useRef(pool);
  library.current = pool;
  const focused = useRef(active);
  focused.current = active;
  useEffect(() => {
    alive.current = true;
    AsyncStorage.getItem(BPM_CACHE_KEY).then((raw) => {
      if (!alive.current) return;
      cacheRef.current = parseBpmCache(raw);
      writable.current = true;
      setCache(cacheRef.current);
    }).catch((cause) => { if (alive.current) setError(String(cause)); })
      .finally(() => { if (alive.current) setLoaded(true); });
    const subscription = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => { alive.current = false; generation.current++; subscription.remove(); };
  }, []);
  const storeResult = useCallback((uri: string, result: CachedVideoBpm) => {
    const entries = Object.entries({ ...cacheRef.current, [uri]: result }).slice(-5000);
    cacheRef.current = Object.fromEntries(entries);
    setCache(cacheRef.current);
    if (writable.current) {
      const raw = JSON.stringify(cacheRef.current);
      writeQueue.current = writeQueue.current.catch(() => undefined).then(() => AsyncStorage.setItem(BPM_CACHE_KEY, raw))
        .catch(() => { if (alive.current) setError('BPM results could not be saved. They remain available until this app closes.'); });
    }
  }, []);
  // A changing last-played timestamp must not cancel a scan or restart its queue.
  const poolKey = pool.map((asset) => asset.uri).join('\n');
  useEffect(() => {
    if (!loaded || !foreground || Platform.OS !== 'android' || !pool.length) return;
    const run = ++generation.current;
    const attempted = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scanNext = async () => {
      if (!alive.current || run !== generation.current) return;
      const allowed = new Set(library.current.map((asset) => asset.uri));
      const next = [...focused.current, ...library.current].find((asset) =>
        allowed.has(asset.uri) && !attempted.has(asset.uri) && !cacheRef.current[asset.uri]);
      if (!next) { setAnalyzing(''); return; }
      setAnalyzing(next.name);
      attempted.add(next.uri);
      let result: CachedVideoBpm;
      try { result = await analyzeVideoBpm(next.uri); }
      catch (cause) { result = { bpm: null, confidence: 0, error: cause instanceof Error ? cause.message : 'Audio analysis failed.' }; }
      if (!alive.current || run !== generation.current) return;
      storeResult(next.uri, result);
      // Give playback a small breathing interval between bounded audio-only decodes.
      timer = setTimeout(() => void scanNext(), 750);
    };
    timer = setTimeout(() => void scanNext(), 1500);
    return () => { generation.current++; if (timer) clearTimeout(timer); setAnalyzing(''); };
  }, [foreground, loaded, poolKey, revision, storeResult]);
  const recordResult = useCallback((videoId: string, result: CachedVideoBpm) => {
    const video = [...focused.current, ...library.current].find((asset) => asset.id === videoId);
    if (video) storeResult(video.uri, result);
  }, [storeResult]);
  const rescan = useCallback(() => {
    generation.current++;
    writable.current = true;
    const next = { ...cacheRef.current };
    for (const asset of library.current) delete next[asset.uri];
    cacheRef.current = next;
    setCache(next);
    setError('');
    writeQueue.current = writeQueue.current.catch(() => undefined).then(() => AsyncStorage.setItem(BPM_CACHE_KEY, JSON.stringify(next)))
      .catch(() => { if (alive.current) setError('The rebuilt BPM cache could not be saved.'); });
    setRevision((value) => value + 1);
  }, []);
  const byId: Record<string, CachedVideoBpm> = {};
  for (const asset of [...pool, ...active]) if (cache[asset.uri]) byId[asset.id] = cache[asset.uri];
  return { byId, analyzing, error, rescan, recordResult,
    completed: pool.filter((asset) => !!cache[asset.uri]).length, total: pool.length };
}
