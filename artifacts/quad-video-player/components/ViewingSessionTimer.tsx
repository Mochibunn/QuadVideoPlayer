import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import {
  elapsedViewingTime, formatViewingTime, localSessionDate, VIEWING_ACHIEVEMENT_MS,
  type ViewingSessionStore,
} from '@/lib/viewing-sessions';

type Props = {
  store: ViewingSessionStore;
  visible: boolean;
  ready: boolean;
  error: string;
  isPlaying: boolean;
  celebration: number | null;
  finishRecap: ViewingSessionStore['leaderboard'][number] | null;
  onCelebrateDone(): void;
  onRecapDismiss(): void;
  onEndSession(): void | Promise<void>;
  onRetry(): void;
};

export default function ViewingSessionTimer({
  store, visible, ready, error, isPlaying, celebration, finishRecap,
  onCelebrateDone, onRecapDismiss, onEndSession, onRetry,
}: Props) {
  const colors = useColors();
  const [now, setNow] = useState(Date.now());
  const [leaderboardVisible, setLeaderboardVisible] = useState(false);
  useEffect(() => {
    if (!store.active?.resumedAtMs) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [store.active?.id, store.active?.resumedAtMs]);

  if (!visible && !celebration) return null;
  const elapsed = store.active
    ? elapsedViewingTime(isPlaying ? store.active : { ...store.active, resumedAtMs: null }, now)
    : null;
  const best = store.leaderboard[0];
  const score = celebration ?? 0;
  const rankingVisible = leaderboardVisible && !celebration && !finishRecap;
  const recapRank = finishRecap ? store.leaderboard.findIndex((entry) => entry.id === finishRecap.id) + 1 : 0;

  return (
    <>
      {visible && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={store.active?.resumedAtMs
            ? `Playback timer ${formatViewingTime(elapsed ?? 0)}. Open personal leaderboard.`
            : `Open playback leaderboard${best ? `. Best ${formatViewingTime(best.durationMs)}` : ''}.`}
          onPress={() => setLeaderboardVisible(true)}
          style={[styles.floating, { backgroundColor: 'rgba(10,10,13,0.90)', borderColor: colors.primary }]}
        >
          <Feather name={store.active?.resumedAtMs ? 'clock' : 'award'} size={16} color={colors.primary} />
          <Text numberOfLines={1} style={[styles.floatingText, { color: colors.foreground }]}>
            {store.active?.resumedAtMs ? formatViewingTime(elapsed ?? 0)
              : best ? `${formatViewingTime(best.durationMs)} · ${formatViewingTime(store.totalPlaybackMs)} total` : 'Play timer'}
          </Text>
        </Pressable>
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
                  {score >= 2 * VIEWING_ACHIEVEMENT_MS ? 'TWO-HOUR MILESTONE' : 'ONE-HOUR MILESTONE'}
                </Text>
                <Text accessibilityRole="header" style={[styles.celebrationTitle, { color: colors.foreground }]}>
                  {score >= 2 * VIEWING_ACHIEVEMENT_MS ? 'Two hours! Incredible!' : 'One hour! You did it!'}
                </Text>
                <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                  You played for {formatViewingTime(score)} and finished on {localSessionDate(finishRecap?.finishedAtMs ?? now)}.
                  {'\n'}All-time playback: {formatViewingTime(store.totalPlaybackMs)}.
                  {'\n'}{recapRank ? `Leaderboard place: #${recapRank}.` : 'Your session is saved with your playback history.'}
                </Text>
                <Pressable accessibilityRole="button" onPress={() => {
                  onCelebrateDone(); onRecapDismiss(); setLeaderboardVisible(true);
                }} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>See the leaderboard</Text>
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
                <Text style={[styles.celebrationEyebrow, { color: colors.primary }]}>SESSION SAVED</Text>
                <Text accessibilityRole="header" style={[styles.celebrationTitle, { color: colors.foreground }]}>Your loop total</Text>
                <Text style={[styles.duration, styles.recapDuration, { color: colors.foreground }]}>
                  {formatViewingTime(finishRecap.durationMs)}
                </Text>
                <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                  {recapRank ? `Leaderboard place: #${recapRank}.` : 'Session saved to your all-time total.'}
                  {'\n'}Finished {localSessionDate(finishRecap.finishedAtMs)}
                  {'\n'}All-time playback: {formatViewingTime(store.totalPlaybackMs)}
                </Text>
                <Pressable accessibilityRole="button" onPress={() => {
                  onRecapDismiss(); setLeaderboardVisible(true);
                }} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>See the leaderboard</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={onRecapDismiss} style={styles.secondaryButton}>
                  <Text style={[styles.closeText, { color: colors.mutedForeground }]}>Close</Text>
                </Pressable>
              </ScrollView>
            ) : (
              <>
                <View style={styles.header}>
                  <View style={styles.heading}>
                    <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>Playback leaderboard</Text>
                    <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Your best sessions · saved on this device</Text>
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
                  {!store.leaderboard.length ? (
                    <Text style={[styles.empty, { color: colors.mutedForeground }]}>Finish a session to set your first score.</Text>
                  ) : store.leaderboard.map((entry, index) => (
                    <View key={entry.id} style={[styles.scoreRow, { borderColor: colors.border }]}>
                      <Text style={[styles.rankNumber, { color: index === 0 ? '#ffd248' : colors.mutedForeground }]}>
                        {String(index + 1).padStart(2, '0')}
                      </Text>
                      <View style={styles.scoreInfo}>
                        <Text style={[styles.duration, { color: colors.foreground }]}>{formatViewingTime(entry.durationMs)}</Text>
                        <Text style={[styles.date, { color: colors.mutedForeground }]}>{localSessionDate(entry.finishedAtMs)}</Text>
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
  floating: {
    position: 'absolute', zIndex: 30, bottom: 14, right: 14, minHeight: 42, maxWidth: '85%',
    flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14, borderRadius: 24, borderWidth: 1,
  },
  floatingText: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'], maxWidth: 310 },
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 18, backgroundColor: 'rgba(0,0,0,0.84)' },
  panel: { width: '92%', maxWidth: 520, maxHeight: '88%', padding: 20, borderRadius: 20, borderWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  heading: { flex: 1 },
  title: { fontSize: 21, fontWeight: '800' },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  rows: { flexShrink: 1 },
  rowsContent: { gap: 8, paddingVertical: 6 },
  activeCard: { padding: 14, borderWidth: 1, borderRadius: 14, marginBottom: 5 },
  scoreTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rank: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  duration: { fontSize: 19, fontWeight: '800', fontVariant: ['tabular-nums'] },
  recapDuration: { fontSize: 42, marginTop: 14, textAlign: 'center' },
  date: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  totalLabel: { fontSize: 14, fontWeight: '600' },
  total: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
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
