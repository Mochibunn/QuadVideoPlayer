import { Platform } from 'react-native';
import { getSamsungHealthBridge } from './heart-rate-bridge';

export type WatchMotionState = {
  connected: boolean;
  available: boolean;
  status: string;
  x: number | null;
  y: number | null;
  z: number | null;
  magnitude: number | null;
  gestureId: string | null;
  receivedAtMs: number | null;
};

/** Real watch → paired phone → tablet data; never falls back to simulated movement. */
export async function readWatchMotion(): Promise<WatchMotionState> {
  if (Platform.OS !== 'android') throw new Error('Watch wrist controls require the Android app.');
  const bridge = getSamsungHealthBridge();
  if (typeof bridge.getWatchMotion !== 'function') {
    throw new Error('Update the tablet, phone and watch APKs to use wrist controls.');
  }
  return bridge.getWatchMotion();
}
