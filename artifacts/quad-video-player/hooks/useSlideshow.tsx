import React, { createContext, useContext, useState } from 'react';
import { DEFAULT_SLIDESHOW, type Slideshow } from '@/lib/slideshow';

type ContextValue = { slideshow: Slideshow; setSlideshow: React.Dispatch<React.SetStateAction<Slideshow>> };
const Context = createContext<ContextValue | null>(null);
export function SlideshowProvider({ children }: { children: React.ReactNode }) {
  const [slideshow, setSlideshow] = useState<Slideshow>({ ...DEFAULT_SLIDESHOW, pool: [] });
  return <Context.Provider value={{ slideshow, setSlideshow }}>{children}</Context.Provider>;
}
export function useSlideshow() {
  const value = useContext(Context);
  if (!value) throw new Error('The slideshow provider is missing.');
  return value;
}
