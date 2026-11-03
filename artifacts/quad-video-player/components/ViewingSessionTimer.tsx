import { Feather } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SessionMilestoneConfetti from '@/components/SessionMilestoneConfetti';
import PixelIcon from '@/components/PixelIcon';
import { useColors } from '@/hooks/useColors';
import {
  celebrationLineForMinute, celebrationLinesFrom, DEFAULT_CONGRATS_TEXT, experienceIntoLevel, levelForExperience,
  nextCheerMinute, XP_PER_LEVEL,
} from '@/lib/player-rewards';
import { heartSummary } from '@/lib/session-stats-overlay';
import { evaluatePlayerAchievements, playerRankTitle, type PlayerAchievement } from '@/lib/player-achievements';
import {
  elapsedViewingTime, formatViewingTime, localSessionDate, mergeHeartRateStats, VIEWING_ACHIEVEMENT_MS,
  type ViewingSessionStore,
} from '@/lib/viewing-sessions';

type Props = {
  store: ViewingSessionStore;
  totalVideoCount: number;
  visible: boolean;
  ready: boolean;
  error: string;
  isPlaying: boolean;
  celebration: number | null;
  milestone: number | null;
  xp: number;
  congratsMessage: string;
  finishRecap: ViewingSessionStore['leaderboard'][number] | null;
  onMilestoneDone(): void;
  onCelebrateDone(): void;
  onRecapDismiss(): void;
  onEndSession(): void | Promise<void>;
  onRetry(): void;
  /** Controlled leaderboard visibility (main toolbar). Falls back to internal state when omitted. */
  open?: boolean;
  onClose?: () => void;
  /** Render the built-in stationary button. Default true. */
  showButton?: boolean;
  /** Per-minute cheer lines; falls back to the default seed. */
  celebrationLines?: string[];
  onGenerateCelebrations?: () => Promise<void>;
  generatingCelebrations?: boolean;
  showMinuteCheers?: boolean;
  generatedAchievements?: PlayerAchievement[];
  onGenerateAchievements?: () => Promise<void>;
  generatingAchievements?: boolean;
};

function CheerText({ text }: { text: string }) {
  const offsets = [[-2, 0], [2, 0], [0, -2], [0, 2], [-1.5, -1.5], [1.5, 1.5], [-1.5, 1.5], [1.5, -1.5]];
  return (
    <View pointerEvents="none" style={styles.cheerWrap}>
      <View>
        {offsets.map(([x, y], i) => (
          <Text key={i} numberOfLines={3} adjustsFontSizeToFit
            style={[styles.cheer, styles.cheerStroke, { transform: [{ translateX: x }, { translateY: y }] }]}>{text}</Text>
        ))}
        <Text accessibilityLiveRegion="polite" numberOfLines={3} adjustsFontSizeToFit style={[styles.cheer, styles.cheerFill]}>{text}</Text>
      </View>
    </View>
  );
}

export default function ViewingSessionTimer({
  store, totalVideoCount, visible, ready, error, isPlaying, celebration, milestone, xp, congratsMessage, finishRecap,
  onMilestoneDone,
  onCelebrateDone, onRecapDismiss, onEndSession, onRetry,
  open, onClose, showButton = true, celebrationLines, onGenerateCelebrations, generatingCelebrations = false,
  showMinuteCheers = true,
  generatedAchievements = [],
  onGenerateAchievements,
  generatingAchievements = false,
}: Props) {
  const colors = useColors();
  const [now, setNow] = useState(Date.now());
  const [internalOpen, setInternalOpen] = useState(false);
  const leaderboardVisible = !!open || internalOpen;
  const setLeaderboardVisible = (value: boolean) => {
    setInternalOpen(value);
    if (!value) onClose?.();
  };
  const [cheer, setCheer] = useState<{ minute: number; text: string } | null>(null);
  const cheerBaseline = useRef<{ id: string; minute: number } | null>(null);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!store.active?.resumedAtMs) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [store.active?.id, store.active?.resumedAtMs]);
  const liveElapsed = store.active
    ? elapsedViewingTime(isPlaying ? store.active : { ...store.active, resumedAtMs: null }, now) : 0;
  const playingLive = isPlaying && !!store.active?.resumedAtMs;
  const cheerLines = celebrationLinesFrom(celebrationLines, DEFAULT_CONGRATS_TEXT);
  const cheerLinesRef = useRef(cheerLines);
  cheerLinesRef.current = cheerLines;
  const cheerLinesKey = JSON.stringify(cheerLines);
  const activeId = store.active?.id ?? null;
  const currentMinute = Math.floor(liveElapsed / 60_000);
  useEffect(() => {
    if (!activeId || !showMinuteCheers) { cheerBaseline.current = null; setCheer(null); return; }
    if (!cheerBaseline.current || cheerBaseline.current.id !== activeId) {
      // Baseline on first sight (incl. restore) so old minutes never replay.
      cheerBaseline.current = { id: activeId, minute: currentMinute };
      if (playingLive) setCheer({ minute: currentMinute, text: celebrationLineForMinute(cheerLinesRef.current, currentMinute) });
      return;
    }
    if (!playingLive) { setCheer(null); return; }
    const next = nextCheerMinute(cheerBaseline.current.minute, currentMinute * 60_000, true);
    if (next !== null) {
      cheerBaseline.current.minute = next;
      setCheer({ minute: next, text: celebrationLineForMinute(cheerLinesRef.current, next) });
    } else {
      const text = celebrationLineForMinute(cheerLinesRef.current, currentMinute);
      setCheer((previous) => previous?.text === text && previous.minute === currentMinute ? previous : { minute: currentMinute, text });
    }
  }, [activeId, currentMinute, playingLive, showMinuteCheers, cheerLinesKey]);
  const [generateError, setGenerateError] = useState('');

  if (!visible && !celebration && !milestone && !cheer && !leaderboardVisible && !finishRecap) return null;
  const elapsed = store.active
    ? elapsedViewingTime(isPlaying ? store.active : { ...store.active, resumedAtMs: null }, now)
    : null;
  const best = store.leaderboard[0];
  const score = celebration ?? 0;
  const rankingVisible = leaderboardVisible && !celebration && !finishRecap;
  const recapRank = finishRecap ? store.leaderboard.findIndex((entry) => entry.id === finishRecap.id) + 1 : 0;
  const level = levelForExperience(xp);
  const levelProgress = experienceIntoLevel(xp) / XP_PER_LEVEL;
  const allAchievements = evaluatePlayerAchievements({
    completedSessions: store.leaderboard.length,
    totalPlaybackMs: store.totalPlaybackMs + (store.active ? elapsed ?? 0 : 0),
    bestSessionMs: Math.max(0, ...store.leaderboard.map((entry) => entry.durationMs)),
    xp,
    totalVideosWatched: (store.totalVideosWatched ?? 0) + (store.active?.watchedVideoIds.length ?? 0),
    miniGamesWon: store.miniGamesWon ?? 0,
  });
  const extras = generatedAchievements.map((item) => {
    const progress = item.metric === 'totalPlaybackMs' ? store.totalPlaybackMs + (store.active ? elapsed ?? 0 : 0)
      : item.metric === 'bestSessionMs' ? Math.max(0, ...store.leaderboard.map((entry) => entry.durationMs))
        : item.metric === 'xp' ? xp
          : item.metric === 'totalVideosWatched' ? (store.totalVideosWatched ?? 0) + (store.active?.watchedVideoIds.length ?? 0)
            : item.metric === 'miniGamesWon' ? store.miniGamesWon ?? 0 : store.leaderboard.length;
    return { ...item, progress: Math.min(item.target, progress), ratio: Math.min(1, progress / item.target), unlocked: progress >= item.target };
  });
  const achievements = [...allAchievements, ...extras];
  const unlockedAchievements = achievements.filter((achievement) => achievement.unlocked).length;
  type HrCarrier = { heartRate?: unknown };
  const storeExtra = store as typeof store & HrCarrier & { totalVideosWatched?: number };
  const finishedVideos = typeof storeExtra.totalVideosWatched === 'number' && Number.isFinite(storeExtra.totalVideosWatched)
    ? storeExtra.totalVideosWatched
    : store.leaderboard.reduce((sum, entry) => sum + (entry.watchedVideoCount || 0), 0);
  const lifetimeVideos = finishedVideos + (store.active?.watchedVideoIds.length ?? 0);
  const totalHr = heartSummary(mergeHeartRateStats(store.heartRate, store.active?.heartRate));
  const activeHr = heartSummary((store.active as HrCarrier | null)?.heartRate);
  const recapHr = heartSummary((finishRecap as HrCarrier | null)?.heartRate);
  const generate = async () => {
    if (!onGenerateCelebrations) return;
    setGenerateError('');
    try { await onGenerateCelebrations(); }
    catch (reason) { setGenerateError(reason instanceof Error ? reason.message : 'Could not generate new cheers.'); }
  };

  return (
    <>
      <SessionMilestoneConfetti milestoneMs={milestone} message={congratsMessage} onDone={onMilestoneDone} />
      {!!cheer && playingLive && <CheerText key={cheer.minute} text={cheer.text} />}
      {visible && showButton && (
        <View style={[styles.floatingPosition, { bottom: insets.bottom + 14, right: insets.right + 14 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open guild standings and session timer"
            onPress={() => setLeaderboardVisible(true)}
            style={[styles.floating, { backgroundColor: 'rgba(10,10,13,0.90)', borderColor: colors.primary }]}
          >
            <Feather name={store.active?.resumedAtMs ? 'clock' : 'award'} size={16} color={colors.primary} />
            <Text numberOfLines={1} style={[styles.floatingText, { color: colors.foreground }]}>Guild</Text>
          </Pressable>
        </View>
      )}
      <Modal visible={!!celebration || !!finishRecap || rankingVisible} transparent animationType="fade" onRequestClose={() => {
        if (celebration) { onCelebrateDone(); onRecapDismiss(); }
        else if (finishRecap) onRecapDismiss();
        else setLeaderboardVisible(false);
      }}>
        <View style={styles.backdrop}>
          <View style={[styles.panel, { backgroundColor: colors.background, borderColor: colors.border }]}>
            {celebration ? (
              <ScrollView contentContainerStyle={styles.celebration}>
                <View style={[styles.achievementBadge, { backgroundColor: `${colors.primary}24` }]}>
                  <Feather name="award" size={42} color="#ffd248" />
                  <Feather name="star" size={20} color={colors.primary} />
                </View>
                <Text style={[styles.celebrationEyebrow, { color: '#ffd248' }]}>
                  {score >= 2 * VIEWING_ACHIEVEMENT_MS ? 'TWO-HOUR GUILD MILESTONE' : 'ONE-HOUR GUILD MILESTONE'}
                </Text>
                <Text accessibilityRole="header" style={[styles.celebrationTitle, { color: colors.foreground }]}>
                  {congratsMessage}
                </Text>
                <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                  You played for {formatViewingTime(score)} and finished on {localSessionDate(finishRecap?.finishedAtMs ?? now)}.
                  {'\n'}All-time loop: {formatViewingTime(store.totalPlaybackMs)}.
                  {'\n'}{recapRank ? `Guild table place: #${recapRank}.` : 'Your run is saved in the guild ledger.'}
                </Text>
                <Pressable accessibilityRole="button" onPress={() => {
                  onCelebrateDone(); onRecapDismiss(); setLeaderboardVisible(true);
                }} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>View guild standings</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => { onCelebrateDone(); onRecapDismiss(); }} style={styles.secondaryButton}>
                  <Text style={[styles.closeText, { color: colors.mutedForeground }]}>Close</Text>
                </Pressable>
              </ScrollView>
            ) : finishRecap ? (
              <ScrollView contentContainerStyle={styles.celebration}>
                <View style={[styles.achievementBadge, { backgroundColor: `${colors.primary}24` }]}>
                  <Feather name="award" size={42} color={colors.primary} />
                </View>
                <Text style={[styles.celebrationEyebrow, { color: colors.primary }]}>RUN RECORDED</Text>
                <Text accessibilityRole="header" style={[styles.celebrationTitle, { color: colors.foreground }]}>Your den session</Text>
                <Text style={[styles.duration, styles.recapDuration, { color: colors.foreground }]}>
                  {formatViewingTime(finishRecap.durationMs)}
                </Text>
                <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                  {recapRank ? `Guild table place: #${recapRank}.` : 'Added to your all-time loop.'}
                  {'\n'}Finished {localSessionDate(finishRecap.finishedAtMs)}
                  {'\n'}Unique videos watched: {finishRecap.watchedVideoCount}
                  {'\n'}Heart rate min / avg / max: {recapHr.text}
                  {'\n'}Videos in pool: {totalVideoCount}
                  {'\n'}All-time loop: {formatViewingTime(store.totalPlaybackMs)}
                </Text>
                <Pressable accessibilityRole="button" onPress={() => {
                  onRecapDismiss(); setLeaderboardVisible(true);
                }} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>View guild standings</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={onRecapDismiss} style={styles.secondaryButton}>
                  <Text style={[styles.closeText, { color: colors.mutedForeground }]}>Close</Text>
                </Pressable>
              </ScrollView>
            ) : (
              <>
                <View style={styles.header}>
                  <View style={styles.heading}>
                    <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>Guild standings</Text>
                    <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Your strongest runs · saved on this device</Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel="Close leaderboard"
                    onPress={() => setLeaderboardVisible(false)} style={styles.iconButton}>
                    <Feather name="x" size={20} color={colors.foreground} />
                  </Pressable>
                </View>
                {!ready && <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Loading playback history…</Text>}
                {!!error && (
                  <View style={styles.errorBox}>
                    <Text style={[styles.subtitle, { color: colors.destructive }]}>{error}</Text>
                    <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
                      <Text style={[styles.retryText, { color: colors.primary }]}>Retry loading history</Text>
                    </Pressable>
                  </View>
                )}
                <View style={[styles.xpCard, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
                  <View style={styles.scoreTop}>
                    <View>
                      <Text style={[styles.rank, { color: colors.primary }]}>LEVEL {level}</Text>
                      <Text style={[styles.rankTitle, { color: colors.mutedForeground }]}>{playerRankTitle(level)}</Text>
                    </View>
                    <Text style={[styles.xpValue, { color: colors.foreground }]}>{xp} XP</Text>
                  </View>
                  <View style={[styles.xpTrack, { backgroundColor: colors.muted }]}>
                    <View style={[styles.xpFill, { width: `${Math.round(levelProgress * 100)}%`, backgroundColor: colors.primary }]} />
                  </View>
                  <Text style={[styles.date, { color: colors.mutedForeground }]}>
                    {XP_PER_LEVEL - experienceIntoLevel(xp)} XP to level {level + 1} · earned from active playback
                  </Text>
                </View>
                <ScrollView style={styles.rows} contentContainerStyle={styles.rowsContent}>
                  {store.active && (
                    <View style={[styles.activeCard, { borderColor: colors.primary }]}>
                      <View style={styles.scoreTop}>
                        <Text style={[styles.rank, { color: colors.primary }]}>{isPlaying ? 'IN PROGRESS' : 'PAUSED SESSION'}</Text>
                        <Text style={[styles.duration, { color: colors.foreground }]}>{formatViewingTime(elapsed ?? 0)}</Text>
                      </View>
                      <Text style={[styles.date, { color: colors.mutedForeground }]}>
                        Started {localSessionDate(store.active.startedAtMs)} · time stops while paused
                      </Text>
                      <Text style={[styles.date, { color: colors.mutedForeground }]}>
                        {store.active.watchedVideoIds.length} unique videos watched · {totalVideoCount} in pool
                      </Text>
                      <Text style={[styles.date, { color: colors.mutedForeground }]}>
                        Heart rate min / avg / max: {activeHr.text}
                      </Text>
                      {!isPlaying && (
                        <Pressable accessibilityRole="button" onPress={() => void onEndSession()}
                          style={[styles.endButton, { borderColor: colors.border }]}>
                          <Feather name="square" size={14} color={colors.destructive} />
                          <Text style={[styles.endText, { color: colors.destructive }]}>End and save this session</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>All-time playback</Text>
                    <Text style={[styles.total, { color: colors.foreground }]}>{formatViewingTime(store.totalPlaybackMs)}</Text>
                  </View>
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Total videos watched</Text>
                    <Text style={[styles.total, { color: colors.foreground }]}>{lifetimeVideos}</Text>
                  </View>
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Paw Parry wins</Text>
                    <Text style={[styles.total, { color: colors.foreground }]}>{store.miniGamesWon ?? 0}</Text>
                  </View>
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>All-time HR min / avg / max</Text>
                    <Text style={[styles.total, { color: colors.foreground }]}>{totalHr.text}</Text>
                  </View>
                  <View style={[styles.xpCard, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
                    <Text style={[styles.totalLabel, { color: colors.foreground }]}>Minute cheers</Text>
                    <Text style={[styles.date, { color: colors.mutedForeground }]}>
                      {cheerLines.length} lines rotate every active minute. Edit the seed in Settings, guild milestone notes.
                    </Text>
                    {!!generateError && <Text style={[styles.date, { color: colors.destructive }]}>{generateError}</Text>}
                    <Pressable accessibilityRole="button" disabled={!onGenerateCelebrations || generatingCelebrations}
                      accessibilityState={{ disabled: !onGenerateCelebrations || generatingCelebrations, busy: generatingCelebrations }}
                      onPress={() => void generate()}
                      style={[styles.endButton, { borderColor: colors.primary, opacity: !onGenerateCelebrations || generatingCelebrations ? 0.5 : 1 }]}>
                      <Feather name="feather" size={14} color={colors.primary} />
                      <Text style={[styles.endText, { color: colors.primary }]}>
                        {generatingCelebrations ? 'Writing new cheers…' : 'Generate new cheers'}
                      </Text>
                    </Pressable>
                  </View>
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Videos in pool</Text>
                    <Text style={[styles.total, { color: colors.foreground }]}>{totalVideoCount}</Text>
                  </View>
                  <View style={styles.achievementSection}>
                    <View style={styles.achievementHeading}>
                      <Text style={[styles.totalLabel, { color: colors.foreground }]}>Guild honors</Text>
                      <Text style={[styles.achievementCount, { color: colors.primary }]}>
                        {unlockedAchievements}/{achievements.length} unlocked
                      </Text>
                    </View>
                    <View style={styles.xpCard}>
                      <Text style={[styles.date, { color: colors.mutedForeground }]}>
                        Track lifetime time, sessions, XP, watched videos, and Paw Parry wins.
                      </Text>
                      <Pressable accessibilityRole="button" disabled={!onGenerateAchievements || generatingAchievements}
                        onPress={() => void onGenerateAchievements?.()}
                        style={[styles.endButton, { borderColor: colors.primary, opacity: !onGenerateAchievements || generatingAchievements ? 0.5 : 1 }]}>
                        <PixelIcon name="star" color={colors.primary} size={16} />
                        <Text style={[styles.endText, { color: colors.primary }]}>
                          {generatingAchievements ? 'Forging achievements…' : 'Forge 3 AI achievements'}
                        </Text>
                      </Pressable>
                    </View>
                    <View style={styles.achievementGrid}>
                      {achievements.map((achievement) => {
                        const progressText = achievement.metric === 'totalPlaybackMs' || achievement.metric === 'bestSessionMs'
                          ? `${formatViewingTime(achievement.progress)} / ${formatViewingTime(achievement.target)}`
                          : achievement.metric === 'xp'
                            ? `${Math.floor(achievement.progress)} / ${achievement.target} XP`
                            : achievement.metric === 'totalVideosWatched'
                              ? `${Math.floor(achievement.progress)} / ${achievement.target} videos`
                              : achievement.metric === 'miniGamesWon'
                                ? `${Math.floor(achievement.progress)} / ${achievement.target} wins`
                            : `${Math.floor(achievement.progress)} / ${achievement.target} sessions`;
                        return (
                          <View key={achievement.id} style={[
                            styles.achievementCard,
                            { borderColor: achievement.unlocked ? colors.primary : colors.border,
                              backgroundColor: achievement.unlocked ? `${colors.primary}18` : colors.secondary },
                          ]}>
                            <View style={styles.achievementCardHeading}>
                              {achievement.generated
                                ? <PixelIcon name="star" size={17} color={achievement.unlocked ? colors.primary : colors.mutedForeground} />
                                : <Feather name={achievement.icon as keyof typeof Feather.glyphMap} size={17}
                                  color={achievement.unlocked ? colors.primary : colors.mutedForeground} />}
                              <Text numberOfLines={1} style={[styles.achievementName, { color: colors.foreground }]}>
                                {achievement.name}
                              </Text>
                              {achievement.unlocked && <Feather name="check-circle" size={15} color={colors.primary} />}
                            </View>
                            <Text style={[styles.achievementDescription, { color: colors.mutedForeground }]}>
                              {achievement.description}
                            </Text>
                            <View style={[styles.achievementTrack, { backgroundColor: colors.muted }]}>
                              <View style={[styles.achievementFill, { width: `${Math.round(achievement.ratio * 100)}%`, backgroundColor: colors.primary }]} />
                            </View>
                            <Text style={[styles.achievementProgress, { color: achievement.unlocked ? colors.primary : colors.mutedForeground }]}>
                              {achievement.unlocked ? 'UNLOCKED' : progressText}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                  {!store.leaderboard.length ? (
                    <Text style={[styles.empty, { color: colors.mutedForeground }]}>Complete a run to earn your first place on the guild table.</Text>
                  ) : store.leaderboard.map((entry, index) => (
                    <View key={entry.id} style={[styles.scoreRow, { borderColor: colors.border }]}>
                      <Text style={[styles.rankNumber, { color: index === 0 ? '#ffd248' : colors.mutedForeground }]}>
                        {String(index + 1).padStart(2, '0')}
                      </Text>
                      <View style={styles.scoreInfo}>
                        <Text style={[styles.duration, { color: colors.foreground }]}>{formatViewingTime(entry.durationMs)}</Text>
                        <Text style={[styles.date, { color: colors.mutedForeground }]}>
                          {entry.watchedVideoCount > 0 ? `${entry.watchedVideoCount} unique videos · ` : ''}
                          {localSessionDate(entry.finishedAtMs)}
                        </Text>
                        <Text style={[styles.date, { color: colors.mutedForeground }]}>
                          HR {heartSummary((entry as HrCarrier).heartRate).text}
                        </Text>
                      </View>
                      {entry.durationMs >= VIEWING_ACHIEVEMENT_MS && <Feather name="award" size={20} color="#ffd248" />}
                    </View>
                  ))}
                </ScrollView>
                <Pressable accessibilityRole="button" onPress={() => setLeaderboardVisible(false)}
                  style={[styles.primaryButton, { backgroundColor: colors.secondary }]}>
                  <Text style={[styles.primaryText, { color: colors.foreground }]}>Close</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  floatingPosition: { position: 'absolute', zIndex: 30 },
  cheerWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 18, zIndex: 85, elevation: 85 },
  cheer: { width: '100%', textAlign: 'center', fontSize: 44, lineHeight: 52, fontWeight: '900' },
  cheerStroke: { position: 'absolute', color: '#000000' },
  cheerFill: { color: '#fff8fb', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 8 },
  floating: {
    minHeight: 42, maxWidth: '85%',
    flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14, borderRadius: 24, borderWidth: 1,
  },
  floatingText: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'], maxWidth: 310 },
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 18, backgroundColor: 'rgba(0,0,0,0.90)' },
  panel: { width: '92%', maxWidth: 520, maxHeight: '88%', padding: 20, borderRadius: 22, borderWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  heading: { flex: 1 },
  title: { fontSize: 21, fontWeight: '800' },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  rows: { flexShrink: 1 },
  rowsContent: { gap: 8, paddingVertical: 6 },
  activeCard: { padding: 14, borderWidth: 1, borderRadius: 16, marginBottom: 5 },
  xpCard: { padding: 13, borderWidth: StyleSheet.hairlineWidth, borderRadius: 15, gap: 8, marginBottom: 6 },
  xpValue: { fontSize: 13, fontWeight: '700' },
  rankTitle: { fontSize: 10, fontWeight: '700', marginTop: 2 },
  xpTrack: { height: 6, borderRadius: 4, overflow: 'hidden' },
  xpFill: { height: '100%', borderRadius: 4 },
  scoreTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rank: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  duration: { fontSize: 19, fontWeight: '800', fontVariant: ['tabular-nums'] },
  recapDuration: { fontSize: 42, marginTop: 14, textAlign: 'center' },
  date: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  totalLabel: { fontSize: 14, fontWeight: '600' },
  total: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  achievementSection: { gap: 9, paddingVertical: 8 },
  achievementHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  achievementCount: { fontSize: 11, fontWeight: '800' },
  achievementGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  achievementCard: { width: '48%', minHeight: 118, borderWidth: 1, borderRadius: 15, padding: 10, gap: 6 },
  achievementCardHeading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  achievementName: { flex: 1, fontSize: 12, fontWeight: '800' },
  achievementDescription: { minHeight: 30, fontSize: 10, lineHeight: 14 },
  achievementTrack: { height: 5, borderRadius: 4, overflow: 'hidden', marginTop: 'auto' },
  achievementFill: { height: '100%', borderRadius: 4 },
  achievementProgress: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12 },
  rankNumber: { width: 30, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  scoreInfo: { flex: 1 },
  empty: { textAlign: 'center', padding: 22, lineHeight: 21 },
  endButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 40, borderWidth: 1, borderRadius: 10, marginTop: 12 },
  endText: { fontSize: 13, fontWeight: '700' },
  errorBox: { borderWidth: 1, borderColor: 'rgba(246,57,44,0.45)', padding: 12, borderRadius: 10 },
  retry: { paddingVertical: 8 },
  retryText: { fontSize: 14, fontWeight: '700' },
  primaryButton: { alignItems: 'center', justifyContent: 'center', minHeight: 46, paddingHorizontal: 16, borderRadius: 12, marginTop: 12 },
  primaryText: { fontWeight: '800', fontSize: 15 },
  secondaryButton: { alignItems: 'center', padding: 12 },
  closeText: { fontSize: 14, fontWeight: '600' },
  celebration: { alignItems: 'center', padding: 18 },
  achievementBadge: { width: 92, height: 92, borderRadius: 48, alignItems: 'center', justifyContent: 'center', gap: 3 },
  celebrationEyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 20, textAlign: 'center' },
  celebrationTitle: { textAlign: 'center', fontSize: 27, fontWeight: '900', marginTop: 9 },
});
