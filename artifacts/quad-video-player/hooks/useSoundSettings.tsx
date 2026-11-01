import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import { DEFAULT_SOUND, parseSoundSettings, type SoundSettings } from '@/lib/sound-settings';

type PipModule = {
  enterQuadPip(): Promise<void>;
  addListener(event: 'pipChanged', listener: (event: { active: boolean }) => void): { remove(): void };
  addListener(event: 'pipClosed', listener: () => void): { remove(): void };
};
type SettingsContext = {
  sound: SoundSettings;
  setSound: React.Dispatch<React.SetStateAction<SoundSettings>>;
  loaded: boolean;
  inPip: boolean;
  pipClosed: boolean;
  enterPip(): Promise<void>;
};
const Context = createContext<SettingsContext | null>(null);
const KEY = 'quad-video-player.sound-effects';

export function SoundSettingsProvider({ children }: { children: React.ReactNode }) {
  const [sound, setSound] = useState(DEFAULT_SOUND);
  const [loaded, setLoaded] = useState(false);
  const [inPip, setInPip] = useState(false);
  const [pipClosed, setPipClosed] = useState(false);
  const writeQueue = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(KEY).then((raw) => {
      if (active) setSound(parseSoundSettings(raw));
    }).catch(() => {
      Alert.alert('Sound settings unavailable', 'Could not restore the saved sound effects. The original audio will be used.');
    }).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    writeQueue.current = writeQueue.current.then(() => AsyncStorage.setItem(KEY, JSON.stringify(sound)))
      .catch(() => { Alert.alert('Could not save sound settings', 'Your current changes work, but may not be restored next time.'); });
  }, [loaded, sound]);
  useEffect(() => {
    const native = Platform.OS === 'android' ? requireOptionalNativeModule<PipModule>('DownloadsMedia') : null;
    const changed = native?.addListener('pipChanged', ({ active }) => setInPip(active));
    const closed = native?.addListener('pipClosed', () => { setInPip(false); setPipClosed(true); });
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') { setInPip(false); setPipClosed(false); }
    });
    return () => { changed?.remove(); closed?.remove(); app.remove(); };
  }, []);
  const value = useMemo<SettingsContext>(() => ({
    sound, setSound, loaded, inPip, pipClosed,
    async enterPip() {
      try {
        const native = Platform.OS === 'android' ? requireOptionalNativeModule<PipModule>('DownloadsMedia') : null;
        if (!native) throw new Error('Picture-in-picture requires the standalone Android APK.');
        setInPip(true);
        // Render the clean 2x2 grid before Android captures the transition.
        await new Promise((resolve) => setTimeout(resolve, 280));
        await native.enterQuadPip();
      } catch (error) {
        setInPip(false);
        Alert.alert('Could not start picture-in-picture', error instanceof Error ? error.message : 'Please check Android picture-in-picture permissions.');
      }
    },
  }), [sound, loaded, inPip, pipClosed]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSoundSettings() {
  const value = useContext(Context);
  if (!value) throw new Error('Sound settings provider is missing.');
  return value;
}

export function usePlayerSoundEffects(player: object) {
  const { sound, inPip, pipClosed } = useSoundSettings();
  useEffect(() => {
    // Android can deliver onPause before its PiP-mode callback. Arm every
    // player before entering, instead of relying on the later mode query.
    const native = player as { staysActiveInBackground: boolean; pause(): void };
    native.staysActiveInBackground = inPip;
    if (pipClosed) native.pause();
  }, [player, inPip, pipClosed]);
  const config = JSON.stringify(sound);
  useEffect(() => {
    const native = player as { soundEffects?: string };
    if (typeof native.soundEffects === 'string') native.soundEffects = config;
    else if (sound.eq || sound.reverb !== 'off' || sound.echo) {
      Alert.alert('Sound effects unavailable', 'Install the updated standalone Android APK to use audio effects.');
    }
  }, [config, player]);
}
