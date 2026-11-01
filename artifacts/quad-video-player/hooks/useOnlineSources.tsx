import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchSourcePage, parseOnlineSources, parseOnlineSource, type OnlineSource, type RemoteMedia } from '@/lib/online-sources';
import { redditGet } from '@/lib/reddit-account';
import { readRule34Credentials } from '@/lib/rule34-account';

const KEY = 'quad.online-sources.v1';
export type SourceResult = {
  items: RemoteMedia[]; images: RemoteMedia[]; cursor: number | string | null;
  loading: boolean; loaded: boolean; hasMore: boolean; error: string; notice: string;
};
const empty = (): SourceResult => ({ items: [], images: [], cursor: null, loading: false, loaded: false, hasMore: false, error: '', notice: '' });
type ContextValue = {
  sources: OnlineSource[]; results: Record<string, SourceResult>; loaded: boolean; storageError: string;
  refresh(id: string, more?: boolean): Promise<void>; ensureLoaded(id: string): void;
  saveSource(source: OnlineSource): Promise<void>; removeSource(id: string): Promise<void>;
  restoreSources(sources: OnlineSource[]): Promise<void>; retryStorage(): Promise<void>; clearRedditResults(reload?: boolean): void;
};
const Context = createContext<ContextValue | null>(null);
export function OnlineSourcesProvider({ children }: { children: React.ReactNode }) {
  const [sources, setSources] = useState<OnlineSource[]>([]);
  const [results, setResults] = useState<Record<string, SourceResult>>({});
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState('');
  const definitions = useRef(sources);
  const currentResults = useRef(results);
  const controllers = useRef(new Map<string, AbortController>());
  const writing = useRef(false);
  const update = useCallback((id: string, partial: Partial<SourceResult>) => {
    const value = { ...(currentResults.current[id] ?? empty()), ...partial };
    if (partial.items) value.images = partial.items.filter((item) => item.kind === 'image');
    const next = { ...currentResults.current, [id]: value };
    currentResults.current = next; setResults(next);
  }, []);
  const retryStorage = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const value = raw ? parseOnlineSources(JSON.parse(raw)) : [];
      definitions.current = value; setSources(value); setStorageError('');
    } catch { setStorageError('Could not read saved online searches. Retry before editing them; your saved data has not been overwritten.'); }
    finally { setLoaded(true); }
  }, []);
  useEffect(() => {
    void retryStorage();
    return () => { controllers.current.forEach((controller) => controller.abort()); controllers.current.clear(); };
  }, [retryStorage]);
  const refresh = useCallback(async (id: string, more = false) => {
    const source = definitions.current.find((item) => item.id === id);
    if (!source || controllers.current.has(id)) return;
    const previous = currentResults.current[id] ?? empty();
    if (more && (!previous.loaded || !previous.hasMore)) return;
    const controller = new AbortController();
    controllers.current.set(id, controller);
    update(id, { loading: true, error: '', notice: '' });
    try {
      const rule34Credentials = source.kind === 'rule34' ? await readRule34Credentials() : undefined;
      const page = await fetchSourcePage(source, more ? previous.cursor : null, redditGet, controller.signal, (partial) => {
        if (!previous.items.length && controllers.current.get(id) === controller && !controller.signal.aborted) {
          update(id, { items: partial });
        }
      }, rule34Credentials ?? undefined);
      if (controllers.current.get(id) !== controller) return;
      const combined = more ? [...previous.items, ...page.items] : page.items;
      const seen = new Set<string>();
      const items = combined.filter((item) => { if (seen.has(item.uri)) return false; seen.add(item.uri); return true; });
      update(id, { items, cursor: page.cursor, hasMore: page.hasMore, loaded: true, notice: page.notice ?? '' });
    } catch (error) {
      if (controllers.current.get(id) === controller && !controller.signal.aborted) {
        update(id, { error: error instanceof Error ? error.message : 'Could not load this source. Check your connection.' });
      }
    } finally {
      if (controllers.current.get(id) === controller) { controllers.current.delete(id); update(id, { loading: false }); }
    }
  }, [update]);
  const ensureLoaded = useCallback((id: string) => {
    if (!currentResults.current[id]?.loaded && !currentResults.current[id]?.loading && !currentResults.current[id]?.error) void refresh(id);
  }, [refresh]);
  function resetResult(id: string) {
    controllers.current.get(id)?.abort(); controllers.current.delete(id);
    update(id, empty());
  }
  async function persist(value: OnlineSource[], fromCheckpoint = false) {
    if (writing.current) throw new Error('An online source is still being saved. Please try again.');
    if (!loaded || (storageError && !fromCheckpoint)) throw new Error(storageError || 'Saved online sources are still loading.');
    writing.current = true;
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(value));
      definitions.current = value; setSources(value); setStorageError('');
    } finally { writing.current = false; }
  }
  async function saveSource(input: OnlineSource) {
    const source = parseOnlineSource(input);
    const next = [...definitions.current.filter((item) => item.id !== source.id), source];
    await persist(next);
    resetResult(source.id);
    void refresh(source.id);
  }
  async function removeSource(id: string) {
    await persist(definitions.current.filter((item) => item.id !== id));
    resetResult(id);
    const next = { ...currentResults.current }; delete next[id];
    currentResults.current = next; setResults(next);
  }
  async function restoreSources(value: OnlineSource[]) {
    const parsed = parseOnlineSources(value);
    await persist(parsed, true);
    controllers.current.forEach((controller) => controller.abort()); controllers.current.clear();
    currentResults.current = {}; setResults({});
  }
  function clearRedditResults(reload = false) {
    definitions.current.filter((source) => source.kind === 'reddit').forEach((source) => {
      resetResult(source.id);
      if (reload) void refresh(source.id);
    });
  }
  return <Context.Provider value={{ sources, results, loaded, storageError, retryStorage, refresh, ensureLoaded,
    saveSource, removeSource, restoreSources, clearRedditResults }}>{children}</Context.Provider>;
}
export function useOnlineSources() {
  const value = useContext(Context);
  if (!value) throw new Error('Online source settings are unavailable.');
  return value;
}
