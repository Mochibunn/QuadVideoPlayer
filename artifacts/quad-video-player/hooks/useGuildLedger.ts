import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GUILD_LEDGER_KEY, emptyGuildLedger, parseGuildLedger, type GuildLedger,
} from '@/lib/guild-ledger';

/** Persists honors, pins, chat role, and combat counters under their own key. */
export function useGuildLedger() {
  const [ledger, setLedger] = useState<GuildLedger>(emptyGuildLedger);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(GUILD_LEDGER_KEY)
      .then((raw) => { if (!cancelled) setLedger(parseGuildLedger(raw)); })
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) return;
        readyRef.current = true;
        setReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(GUILD_LEDGER_KEY, JSON.stringify(ledger)).catch(() => undefined);
  }, [ledger, ready]);

  /** Functional update; persisted once the stored ledger has loaded. */
  const update = useCallback((change: (current: GuildLedger) => GuildLedger) => {
    setLedger((current) => change(current));
  }, []);

  return { ledger, ready, update };
}
