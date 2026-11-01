import React, { createContext, useContext, useRef, useState, useEffect } from 'react';
import { DEFAULT_SLIDESHOW, snapshotSlideshow, type Slideshow } from '@/lib/slideshow';

export type SlideshowRuntime = { index: number; steps?: number; next?: () => void };
type ContextValue = {
  slideshow: Slideshow; setSlideshow: React.Dispatch<React.SetStateAction<Slideshow>>;
  runtime: React.RefObject<Map<string, SlideshowRuntime>>; revision: number;
  captureSlideshow(): Slideshow; restoreSlideshow(value: Slideshow): void;
};
const Context = createContext<ContextValue | null>(null);
export function SlideshowProvider({ children }: { children: React.ReactNode }) {
  const [slideshow, setSlideshow] = useState<Slideshow>({ ...DEFAULT_SLIDESHOW, pool: [] });
  const [revision, setRevision] = useState(0);
  const runtime = useRef(new Map<string, SlideshowRuntime>());
  useEffect(() => {
    const ids = new Set(slideshow.instances.map((item) => item.id));
    for (const id of runtime.current.keys()) if (!ids.has(id)) runtime.current.delete(id);
  }, [slideshow.instances]);
  function captureSlideshow(): Slideshow {
    return snapshotSlideshow(slideshow, runtime.current);
  }
  function restoreSlideshow(value: Slideshow) {
    runtime.current.clear();
    setSlideshow(value);
    setRevision((old) => old + 1);
  }
  return <Context.Provider value={{ slideshow, setSlideshow, runtime, revision, captureSlideshow, restoreSlideshow }}>{children}</Context.Provider>;
}
export function useSlideshow() {
  const value = useContext(Context);
  if (!value) throw new Error('The slideshow provider is missing.');
  return value;
}
