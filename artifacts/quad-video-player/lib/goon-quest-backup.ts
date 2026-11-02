import { themePresets } from '@/constants/colors';
import { parsePlayExtras, type PlayExtrasSettings } from '@/lib/play-extras';
import { parsePlayerRpg, type PlayerRpgState } from '@/lib/player-rpg';
import { parsePlayerRewards, type PlayerRewardsSettings } from '@/lib/player-rewards';
import { parseSoundSettings, type SoundSettings } from '@/lib/sound-settings';
import { parseSession, type SessionSnapshot } from '@/lib/sessions';
import { parseVideoWatchHistory, type VideoWatchHistory } from '@/lib/video-playback';
import { parseViewingSessions, type ViewingSessionStore } from '@/lib/viewing-sessions';

export const GOON_QUEST_BACKUP_FORMAT = 'goon-quest-backup';
export const GOON_QUEST_BACKUP_VERSION = 1;
export const MAX_BACKUP_CHARS = 20_000_000;

export type PortablePlaybackSettings = {
  normalize: boolean;
  sync: boolean;
  fill: boolean;
  controlsDelay: number;
  sharedVolume: number;
  sound: SoundSettings;
};

export type GoonQuestBackup = {
  format: typeof GOON_QUEST_BACKUP_FORMAT;
  formatVersion: typeof GOON_QUEST_BACKUP_VERSION;
  appVersion: string;
  exportedAt: string;
  session: SessionSnapshot | null;
  progress: {
    rpg: PlayerRpgState;
    viewing: ViewingSessionStore;
    rewards: PlayerRewardsSettings;
    videoWatchHistory: VideoWatchHistory;
    themeId: string;
    playExtras: PlayExtrasSettings;
    playbackSettings: PortablePlaybackSettings;
  };
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is missing or invalid.`);
  }
  return value as Record<string, unknown>;
}

export function createGoonQuestBackup(input: Omit<GoonQuestBackup, 'format' | 'formatVersion'>): GoonQuestBackup {
  const { session, ...rest } = input;
  // Online-source configuration is intentionally excluded from transfers.
  const safeSession = session ? (({ sources: _sources, ...saved }) => saved)(session) : null;
  return {
    format: GOON_QUEST_BACKUP_FORMAT,
    formatVersion: GOON_QUEST_BACKUP_VERSION,
    ...rest,
    session: safeSession,
  };
}

export function parseGoonQuestBackup(raw: string, now = Date.now()): GoonQuestBackup {
  if (raw.length > MAX_BACKUP_CHARS) throw new Error('This backup is too large to import safely.');
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  const data = object(decoded, 'Backup');
  if (data.format !== GOON_QUEST_BACKUP_FORMAT || data.formatVersion !== GOON_QUEST_BACKUP_VERSION) {
    throw new Error('This is not a supported Goon Quest backup.');
  }
  if (typeof data.appVersion !== 'string' || data.appVersion.length > 32 ||
      typeof data.exportedAt !== 'string' || !Number.isFinite(Date.parse(data.exportedAt))) {
    throw new Error('The backup has invalid version or export date information.');
  }
  const rawProgress = object(data.progress, 'Progress');
  const rpg = parsePlayerRpg(JSON.stringify(rawProgress.rpg), now);
  const viewing = parseViewingSessions(JSON.stringify(rawProgress.viewing));
  const rewards = parsePlayerRewards(JSON.stringify(rawProgress.rewards));
  const videoWatchHistory = parseVideoWatchHistory(JSON.stringify(rawProgress.videoWatchHistory));
  const themeId = typeof rawProgress.themeId === 'string' &&
    themePresets.some((theme) => theme.id === rawProgress.themeId) ? rawProgress.themeId : 'amethyst';
  const playExtras = parsePlayExtras(rawProgress.playExtras);
  const settings = object(rawProgress.playbackSettings, 'Playback settings');
  const bool = (value: unknown, name: string) => {
    if (typeof value !== 'boolean') throw new Error(`The backup has invalid ${name} settings.`);
    return value;
  };
  const numeric = (value: unknown, name: string, min: number, max: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`The backup has invalid ${name} settings.`);
    }
    return Math.max(min, Math.min(max, value));
  };
  const playbackSettings: PortablePlaybackSettings = {
    normalize: bool(settings.normalize, 'normalization'),
    sync: bool(settings.sync, 'volume sync'),
    fill: bool(settings.fill, 'video scaling'),
    controlsDelay: Math.round(numeric(settings.controlsDelay, 'controls delay', 0, 30)),
    sharedVolume: numeric(settings.sharedVolume, 'shared volume', 0, 1),
    sound: parseSoundSettings(JSON.stringify(settings.sound)),
  };
  let session: SessionSnapshot | null = null;
  if (data.session !== null && data.session !== undefined) {
    const parsed = parseSession(JSON.stringify(data.session));
    const { sources: _sources, ...safeSession } = parsed;
    session = safeSession;
  }
  return {
    format: GOON_QUEST_BACKUP_FORMAT,
    formatVersion: GOON_QUEST_BACKUP_VERSION,
    appVersion: data.appVersion,
    exportedAt: data.exportedAt,
    session,
    progress: { rpg, viewing, rewards, videoWatchHistory, themeId, playExtras, playbackSettings },
  };
}
