import { requireNativeModule } from 'expo-modules-core';
import type { WatchMotionState } from './watch-motion-bridge';

export type BluetoothPeer = {
  name: string;
  address: string;
};

export type HeartRateBridgeState = {
  bpm: number | null;
  receivedAtMs: number | null;
  status?: string;
  active?: boolean;
  connected?: boolean;
  tabletConnected?: boolean;
};

export type SamsungHealthBridgeNative = {
  getWatchMotion(): Promise<WatchMotionState>;
  getBondedDevices(): Promise<BluetoothPeer[]>;
  getPhoneState(): Promise<HeartRateBridgeState>;
  getTabletState(): Promise<HeartRateBridgeState>;
  startPhoneRelay(): Promise<boolean>;
  stopPhoneRelay(): Promise<boolean>;
  openBluetoothSettings(): Promise<boolean>;
  connectTablet(address: string): Promise<HeartRateBridgeState>;
  disconnectTablet(): Promise<HeartRateBridgeState>;
};

export function getSamsungHealthBridge(): SamsungHealthBridgeNative {
  return requireNativeModule<SamsungHealthBridgeNative>('SamsungHealthBridge');
}

export function isHeartRateFresh(
  state: HeartRateBridgeState,
  now = Date.now(),
  maxAgeMs = 30_000,
): boolean {
  return typeof state.bpm === 'number' &&
    typeof state.receivedAtMs === 'number' &&
    now >= state.receivedAtMs &&
    now - state.receivedAtMs <= maxAgeMs;
}
