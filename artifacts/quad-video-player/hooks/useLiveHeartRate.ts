import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { getSamsungHealthBridge, isHeartRateFresh } from '@/lib/heart-rate-bridge';

/** Reads the real relay independently of the settings window. Never synthesizes samples. */
export function useLiveHeartRate() {
  const [reading, setReading] = useState<{ bpm: number | null; sampleId: string | null }>({ bpm: null, sampleId: null });
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let alive = true;
    let busy = false;
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        const bridge = getSamsungHealthBridge();
        const [tablet, phone] = await Promise.all([bridge.getTabletState(), bridge.getPhoneState()]);
        const source = tablet.connected && isHeartRateFresh(tablet, Date.now(), 10_000)
          ? { state: tablet, role: 'tablet' }
          : phone.active && isHeartRateFresh(phone, Date.now(), 10_000) ? { state: phone, role: 'phone' } : null;
        if (alive) setReading(source
          ? { bpm: source.state.bpm, sampleId: `${source.role}:${source.state.receivedAtMs}` }
          : { bpm: null, sampleId: null });
      } catch { if (alive) setReading({ bpm: null, sampleId: null }); }
      finally { busy = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  return reading;
}
