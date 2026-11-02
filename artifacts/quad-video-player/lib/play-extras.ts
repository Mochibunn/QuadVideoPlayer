export const PLAY_EXTRAS_KEY = 'goon-quest.play-extras.v1';
export const KEY_REPEAT_MIN_SECONDS = 5;
export const KEY_REPEAT_MAX_SECONDS = 300;

export type PlayExtrasSettings = {
  speakCelebrations: boolean;
  speakDialogue: boolean;
  keysEnabled: boolean;
  keyRepeatSeconds: number;
};

export const DEFAULT_PLAY_EXTRAS: PlayExtrasSettings = {
  speakCelebrations: false,
  speakDialogue: false,
  keysEnabled: false,
  keyRepeatSeconds: 30,
};

export function parsePlayExtras(value: unknown): PlayExtrasSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_PLAY_EXTRAS };
  }
  const data = value as Record<string, unknown>;
  const seconds = typeof data.keyRepeatSeconds === 'number' && Number.isFinite(data.keyRepeatSeconds)
    ? Math.round(data.keyRepeatSeconds) : DEFAULT_PLAY_EXTRAS.keyRepeatSeconds;
  return {
    speakCelebrations: data.speakCelebrations === true,
    speakDialogue: data.speakDialogue === true,
    keysEnabled: data.keysEnabled === true,
    keyRepeatSeconds: Math.max(KEY_REPEAT_MIN_SECONDS, Math.min(KEY_REPEAT_MAX_SECONDS, seconds)),
  };
}
