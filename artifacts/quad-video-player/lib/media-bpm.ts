import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { estimateBpm, type BeatEstimate } from './beat-analysis';

type NativeBpmAnalyzer = {
  analyzeVideoBpm(uri: string): Promise<{ envelope: number[]; sampleRate: number; analyzedSeconds: number }>;
};

export type VideoBpmResult = BeatEstimate & { analyzedSeconds: number };

export async function analyzeVideoBpm(uri: string): Promise<VideoBpmResult> {
  if (Platform.OS !== 'android') {
    throw new Error('BPM detection is available in the Android app.');
  }
  const native = requireOptionalNativeModule<NativeBpmAnalyzer>('DownloadsMedia');
  if (!native || typeof native.analyzeVideoBpm !== 'function') {
    throw new Error('BPM detection requires the updated Goon Quest Android APK.');
  }
  const audio = await native.analyzeVideoBpm(uri);
  if (!Array.isArray(audio.envelope) || !Number.isFinite(audio.sampleRate)) {
    throw new Error('The video audio analyzer returned invalid data.');
  }
  return {
    ...estimateBpm(audio.envelope, audio.sampleRate),
    analyzedSeconds: audio.analyzedSeconds,
  };
}
