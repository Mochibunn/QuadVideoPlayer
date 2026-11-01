import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { createControlsVisibility } from '@/lib/controls-visibility';

export function useAutoHideControls(active: boolean, suspended: boolean, delaySeconds: number) {
  const [visible, setVisible] = useState(true);
  const [screenReader, setScreenReader] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const controller = useRef<ReturnType<typeof createControlsVisibility> | null>(null);
  if (!controller.current) controller.current = createControlsVisibility(setVisible);
  const controls = controller.current;

  useEffect(() => {
    controls.setDelaySeconds(delaySeconds);
  }, [controls, delaySeconds]);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (mounted) setScreenReader(enabled);
    }).catch(() => {
      // Keep controls accessible if the accessibility service cannot be queried.
      if (mounted) setScreenReader(true);
    });
    const reader = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    const app = AppState.addEventListener('change', (state) => {
      setForeground(state === 'active');
    });
    return () => {
      mounted = false;
      reader.remove();
      app.remove();
      controls.dispose();
    };
  }, [controls]);

  useEffect(() => {
    controls.setBlocked(!active || suspended || screenReader || !foreground);
    return () => controls.dispose();
  }, [active, suspended, screenReader, foreground, controls]);

  return { visible, toggle: controls.toggle, hold: controls.hold, release: controls.release };
}
