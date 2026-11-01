export const CONTROLS_IDLE_MS = 4500;
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
    if (!blocked && !held && visible) {
      cancelTimer = schedule(() => {
        cancelTimer = undefined;
        setVisible(false);
      }, CONTROLS_IDLE_MS);
    }
  }
  function reveal() {
    setVisible(true);
    armTimer();
  }
  return {
    reveal,
    hold() { held = true; reveal(); },
    release() { held = false; armTimer(); },
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
