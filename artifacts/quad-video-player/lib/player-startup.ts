import { videoSourceForUri } from './media-formats';

type StartupPlayer = {
  replaceAsync(source: ReturnType<typeof videoSourceForUri>): Promise<void>;
  play(): void;
  pause(): void;
};
// Local files do not need four independent, large streaming read-ahead caches.
export const QUAD_BUFFER_OPTIONS = {
  preferredForwardBufferDuration: 4,
  minBufferForPlayback: 0.25,
  maxBufferBytes: 12 * 1024 * 1024,
  prioritizeTimeOverSizeThreshold: false,
} as const;
export const AUDIO_BUFFER_OPTIONS = { ...QUAD_BUFFER_OPTIONS, maxBufferBytes: 2 * 1024 * 1024 } as const;
/** Defer native loading until after player/view construction, limiting startup pressure. */
export function prepareVideoSlot(
  player: StartupPlayer,
  uri: string,
  slot: number,
  shouldPlay: () => boolean,
  onError: (error: unknown) => void,
  schedule: (callback: () => void, delay: number) => ReturnType<typeof setTimeout> = setTimeout,
  cancel: (timer: ReturnType<typeof setTimeout>) => void = clearTimeout,
) {
  let active = true;
  const timer = schedule(() => {
    void (async () => {
      try {
        if (!active) return;
        await player.replaceAsync(videoSourceForUri(uri));
        if (!active) return;
        if (shouldPlay()) player.play();
        else player.pause();
      } catch (error) {
        if (active) onError(error);
      }
    })();
  }, Math.max(0, Math.min(3, slot)) * 200);
  return () => { active = false; cancel(timer); };
}
