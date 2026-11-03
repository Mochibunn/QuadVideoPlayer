export type AchievementMetric =
  | 'completedSessions' | 'totalPlaybackMs' | 'bestSessionMs' | 'xp' | 'totalVideosWatched' | 'miniGamesWon';

export type PlayerAchievement = {
  id: string;
  name: string;
  description: string;
  icon: string;
  metric: AchievementMetric;
  target: number;
  generated?: boolean;
};

export type AchievementStats = {
  completedSessions: number;
  totalPlaybackMs: number;
  bestSessionMs: number;
  xp: number;
  totalVideosWatched: number;
  miniGamesWon: number;
};

export const playerRanks = [
  { level: 1, title: 'Denling' },
  { level: 3, title: 'Gooner on the Prowl' },
  { level: 5, title: 'Moonfang Regular' },
  { level: 8, title: 'Wildpaw Adept' },
  { level: 12, title: 'After-hours Enchanter' },
  { level: 20, title: 'Grand Goonmancer' },
] as const;

export const playerAchievements: PlayerAchievement[] = [
  { id: 'first-clear', name: 'First Pawprint', description: 'Complete your first den session.', icon: 'flag', metric: 'completedSessions', target: 1 },
  { id: 'ten-runs', name: 'Ten Den Nights', description: 'Finish ten timed sessions in your private den.', icon: 'repeat', metric: 'completedSessions', target: 10 },
  { id: 'timekeeper', name: 'An Hour in the Den', description: 'Reach one hour of total playback.', icon: 'clock', metric: 'totalPlaybackMs', target: 60 * 60_000 },
  { id: 'marathon', name: 'Long-Haul Gooner', description: 'Finish a session lasting one hour.', icon: 'award', metric: 'bestSessionMs', target: 60 * 60_000 },
  { id: 'arcade-regular', name: 'Den Fixture', description: 'Reach ten hours of total playback.', icon: 'activity', metric: 'totalPlaybackMs', target: 10 * 60 * 60_000 },
  { id: 'level-ten', name: 'Goonmancer Apprentice', description: 'Earn enough XP to reach level 10.', icon: 'zap', metric: 'xp', target: 90 },
  { id: 'clip-scout', name: 'Clip Scout', description: 'Watch 25 videos across your sessions.', icon: 'film', metric: 'totalVideosWatched', target: 25 },
  { id: 'clip-collector', name: 'Den Archivist', description: 'Watch 100 videos across your sessions.', icon: 'archive', metric: 'totalVideosWatched', target: 100 },
  { id: 'paw-parry-first', name: 'Paw Parry Initiate', description: 'Finish a Paw Parry run with a score.', icon: 'target', metric: 'miniGamesWon', target: 1 },
  { id: 'paw-parry-veteran', name: 'Wrist-Rune Adept', description: 'Finish ten Paw Parry runs with a score.', icon: 'activity', metric: 'miniGamesWon', target: 10 },
];

export const ACHIEVEMENT_METRICS: AchievementMetric[] = [
  'completedSessions', 'totalPlaybackMs', 'bestSessionMs', 'xp', 'totalVideosWatched', 'miniGamesWon',
];
const MAX_GENERATED_ACHIEVEMENTS = 24;

/** Validate local-model output before it can become a tracked badge. */
export function parseGeneratedAchievements(value: unknown, existingIds: readonly string[] = []): PlayerAchievement[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set(existingIds.map((id) => id.toLowerCase()));
  const output: PlayerAchievement[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const metric = row.metric;
    if (!ACHIEVEMENT_METRICS.includes(metric as AchievementMetric)) continue;
    const target = typeof row.target === 'number' && Number.isFinite(row.target) ? Math.round(row.target) : 0;
    const upper = metric === 'totalPlaybackMs' || metric === 'bestSessionMs' ? 24 * 60 * 60_000
      : metric === 'xp' ? 100_000 : 10_000;
    if (target < 1 || target > upper) continue;
    const name = typeof row.name === 'string' ? row.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 48) : '';
    const description = typeof row.description === 'string'
      ? row.description.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) : '';
    const key = name.toLowerCase();
    if (!name || !description || seen.has(key)) continue;
    seen.add(key);
    output.push({
      id: `ai-${key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)}-${output.length}`,
      name,
      description,
      icon: 'award',
      metric: metric as AchievementMetric,
      target,
      generated: true,
    });
    if (output.length >= MAX_GENERATED_ACHIEVEMENTS) break;
  }
  return output;
}

export function mergeGeneratedAchievements(previous: readonly PlayerAchievement[], incoming: readonly PlayerAchievement[]) {
  const all = [...previous, ...incoming];
  const seen = new Set<string>();
  return all.filter((item) => {
    const key = item.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_GENERATED_ACHIEVEMENTS);
}

export function playerRankTitle(level: number): string {
  const safeLevel = Math.max(1, Number.isFinite(level) ? Math.floor(level) : 1);
  return [...playerRanks].reverse().find((rank) => safeLevel >= rank.level)?.title ?? playerRanks[0].title;
}

export function evaluatePlayerAchievements(stats: AchievementStats) {
  const safeStats: AchievementStats = {
    completedSessions: Math.max(0, Number.isFinite(stats.completedSessions) ? stats.completedSessions : 0),
    totalPlaybackMs: Math.max(0, Number.isFinite(stats.totalPlaybackMs) ? stats.totalPlaybackMs : 0),
    bestSessionMs: Math.max(0, Number.isFinite(stats.bestSessionMs) ? stats.bestSessionMs : 0),
    xp: Math.max(0, Number.isFinite(stats.xp) ? stats.xp : 0),
    totalVideosWatched: Math.max(0, Number.isFinite(stats.totalVideosWatched) ? stats.totalVideosWatched : 0),
    miniGamesWon: Math.max(0, Number.isFinite(stats.miniGamesWon) ? stats.miniGamesWon : 0),
  };

  return [...playerAchievements].map((achievement) => {
    const progress = safeStats[achievement.metric];
    return {
      ...achievement,
      progress: Math.min(achievement.target, progress),
      ratio: Math.min(1, progress / achievement.target),
      unlocked: progress >= achievement.target,
    };
  });
}
