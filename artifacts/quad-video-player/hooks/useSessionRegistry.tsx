import React, { createContext, useContext, useRef } from 'react';
import type { AudioSnapshot, VideoSnapshot } from '@/lib/sessions';

type Registry = {
  videos: Map<number, () => VideoSnapshot>;
  audio: Map<string, () => number>;
  captureAudio: (() => AudioSnapshot[]) | null;
  restoreAudio: ((tracks: AudioSnapshot[]) => void) | null;
};
const Context = createContext<Registry | null>(null);
export function SessionRegistryProvider({ children }: { children: React.ReactNode }) {
  const registry = useRef<Registry>({
    videos: new Map(), audio: new Map(), captureAudio: null, restoreAudio: null,
  });
  return <Context.Provider value={registry.current}>{children}</Context.Provider>;
}
export function useSessionRegistry() {
  const registry = useContext(Context);
  if (!registry) throw new Error('The session registry is unavailable.');
  return registry;
}
