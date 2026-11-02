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
  { level: 1, title: 'Rookie' },
  { level: 3, title: 'Loop Runner' },
  { level: 5, title: 'Arcade Ace' },
  { level: 8, title: 'Combo Master' },
  { level: 12, title: 'Focus Champion' },
  { level: 20, title: 'Loop Legend' },
] as const;

export const playerAchievements: PlayerAchievement[] = [
  { id: 'first-clear', name: 'First Clear', description: 'Finish your first timed session.', icon: 'flag', metric: 'completedSessions', target: 1 },
  { id: 'ten-runs', name: 'Ten Runs', description: 'Finish ten timed sessions.', icon: 'repeat', metric: 'completedSessions', target: 10 },
  { id: 'timekeeper', name: 'Timekeeper', description: 'Reach one hour of total playback.', icon: 'clock', metric: 'totalPlaybackMs', target: 60 * 60_000 },
  { id: 'marathon', name: 'Marathon', description: 'Finish a session lasting one hour.', icon: 'award', metric: 'bestSessionMs', target: 60 * 60_000 },
  { id: 'arcade-regular', name: 'Arcade Regular', description: 'Reach ten hours of total playback.', icon: 'activity', metric: 'totalPlaybackMs', target: 10 * 60 * 60_000 },
  { id: 'level-ten', name: 'Level Ten', description: 'Earn enough XP to reach level 10.', icon: 'zap', metric: 'xp', target: 90 },
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
