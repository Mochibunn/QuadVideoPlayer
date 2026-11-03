type Schedule = (callback: () => void, delayMs: number) => () => void;

const scheduleTimeout: Schedule = (callback, delayMs) => {
  const timer = setTimeout(callback, delayMs);
  return () => clearTimeout(timer);
};

/** Owns its deadline independently of React renders and changing callbacks. */
export function startAutoChatLoop(
  options: {
    ready: () => boolean;
    run: () => Promise<void>;
    onError: (error: unknown) => void;
    cooldownMs?: () => number;
  },
  schedule: Schedule = scheduleTimeout,
): () => void {
  let active = true;
  let cancelTimer = () => {};
  const queue = (delayMs: number) => {
    if (active) cancelTimer = schedule(() => { void tick(); }, delayMs);
  };
  const tick = async () => {
    if (!active) return;
    if (!options.ready()) {
      queue(1_000);
      return;
    }
    try {
      await options.run();
    } catch (error) {
      if (active) {
        active = false;
        options.onError(error);
      }
      return;
    }
    // The cooldown starts after completion, not while inference is running.
    queue(Math.max(5_000, Math.min(300_000, options.cooldownMs?.() ?? 30_000)));
  };
  queue(0);
  return () => { active = false; cancelTimer(); };
}
