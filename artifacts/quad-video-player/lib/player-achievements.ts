export type AchievementMetric = 'completedSessions' | 'totalPlaybackMs' | 'bestSessionMs' | 'xp';

export type PlayerAchievement = {
  id: string;
  name: string;
  description: string;
  icon: string;
  metric: AchievementMetric;
  target: number;
};

export type AchievementStats = {
  completedSessions: number;
  totalPlaybackMs: number;
  bestSessionMs: number;
  xp: number;
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
];

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
  };

  return playerAchievements.map((achievement) => {
    const progress = safeStats[achievement.metric];
    return {
      ...achievement,
      progress: Math.min(achievement.target, progress),
      ratio: Math.min(1, progress / achievement.target),
      unlocked: progress >= achievement.target,
    };
  });
}
