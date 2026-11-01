export const DEFAULT_CONTROLS_HIDE_SECONDS = 5;
export const MAX_CONTROLS_HIDE_SECONDS = 30;
export const CONTROLS_IDLE_MS = DEFAULT_CONTROLS_HIDE_SECONDS * 1000;

export function parseControlsHideSeconds(value: unknown): number {
  const numeric = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof numeric === 'number' && Number.isFinite(numeric)
    ? Math.max(0, Math.min(MAX_CONTROLS_HIDE_SECONDS, Math.round(numeric)))
    : DEFAULT_CONTROLS_HIDE_SECONDS;
}
type Schedule = (callback: () => void, delay: number) => () => void;

/** Timer policy separated from React so real interaction sequences can be tested. */
export function createControlsVisibility(
  onChange: (visible: boolean) => void,
  schedule: Schedule = (callback, delay) => {
    const timer = setTimeout(callback, delay);
    return () => clearTimeout(timer);
  },
) {
  let visible = true;
  let blocked = true;
  let held = false;
  let idleMs = CONTROLS_IDLE_MS;
  let cancelTimer: (() => void) | undefined;

  function clearTimer() {
    cancelTimer?.();
    cancelTimer = undefined;
  }
  function setVisible(value: boolean) {
    visible = value;
    onChange(value);
  }
  function armTimer() {
    clearTimer();
    if (!blocked && !held && visible && idleMs > 0) {
      cancelTimer = schedule(() => {
        cancelTimer = undefined;
        setVisible(false);
      }, idleMs);
    }
  }
  function reveal() {
    setVisible(true);
    armTimer();
  }
  return {
    reveal,
    toggle() {
      if (blocked) return;
      setVisible(!visible);
      armTimer();
    },
    // Do not reveal on touch-down: the completed video tap must toggle the
    // original state, not a state already changed by its bubbling touch event.
    hold() { held = true; clearTimer(); },
    release() { held = false; armTimer(); },
    setDelaySeconds(value: number) {
      idleMs = parseControlsHideSeconds(value) * 1000;
      armTimer();
    },
    setBlocked(value: boolean) {
      blocked = value;
      // Pickers, dialogs and app switches can cancel the original touch
      // without delivering a release event to the screen.
      held = false;
      reveal();
    },
    dispose: clearTimer,
  };
}
