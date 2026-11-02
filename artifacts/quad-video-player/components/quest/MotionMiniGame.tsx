import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  initialParryState, isMotionFresh, PARRY_LIVES, PAW_PARRY_BEST_KEY, parryReducer, parseParryBests,
  type ParryBests, type ParryMode,
} from '@/lib/paw-parry';
import { ARCADE_PROMPTS, BATTLE_BARKS, pickLine, rankForParryScore } from '@/lib/quest-flavor';
import { readWatchMotion, type WatchMotionState } from '@/lib/watch-motion-bridge';

const POLL_MS = 200;
const TICK_MS = 100;

export default function MotionMiniGame({ visible, onClose, calm = false }: {
  visible: boolean;
  onClose: () => void;
  calm?: boolean;
}) {
  const colors = useColors();
  const [game, dispatch] = useReducer(parryReducer, initialParryState);
  const [motion, setMotion] = useState<WatchMotionState | null>(null);
  const [pollError, setPollError] = useState('');
  const [bests, setBests] = useState<ParryBests>({ watch: 0, touch: 0 });
  const [newBest, setNewBest] = useState(false);
  const latestGesture = useRef<string | null>(null);
  const modeRef = useRef<ParryMode>('watch');
  modeRef.current = game.mode;
  const pulse = useRef(new Animated.Value(0)).current;
  const now = Date.now();
  const fresh = isMotionFresh(motion, now);
  const running = game.phase === 'rest' || game.phase === 'cue';

  // Load personal bests. Merge with max so a late load never lowers a just-earned score.
  const [storage, setStorage] = useState<'loading' | 'ready' | 'error'>('loading');
  const [saveError, setSaveError] = useState('');
  const [pendingSave, setPendingSave] = useState<ParryBests | null>(null);
  const loadBests = useCallback(() => {
    setStorage('loading');
    AsyncStorage.getItem(PAW_PARRY_BEST_KEY)
      .then((raw) => {
        const loaded = parseParryBests(raw);
        setBests((current) => ({ watch: Math.max(current.watch, loaded.watch), touch: Math.max(current.touch, loaded.touch) }));
        setStorage('ready');
      })
      .catch(() => setStorage('error'));
  }, []);
  useEffect(() => { loadBests(); }, [loadBests]);

  const writeBests = useCallback((next: ParryBests) => {
    setSaveError('');
    AsyncStorage.setItem(PAW_PARRY_BEST_KEY, JSON.stringify(next))
      .then(() => setPendingSave(null))
      .catch(() => { setPendingSave(next); setSaveError('Your best score was not saved.'); });
  }, []);

  // Poll the real watch relay only while open; never overlap requests.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const next = await readWatchMotion();
        if (cancelled) return;
        setMotion(next);
        setPollError('');
        const at = Date.now();
        const ok = isMotionFresh(next, at);
        if (ok && next.gestureId) latestGesture.current = next.gestureId;
        dispatch({ type: 'sensor', now: at, ok, gestureId: next.gestureId });
        if (ok && modeRef.current === 'watch') {
          dispatch({ type: 'swing', now: at, gestureId: next.gestureId, source: 'watch' });
        }
      } catch (error) {
        if (cancelled) return;
        setPollError(error instanceof Error ? error.message : 'Watch relay unavailable.');
        dispatch({ type: 'sensor', now: Date.now(), ok: false, gestureId: null });
      } finally {
        if (!cancelled) timer = setTimeout(() => void poll(), POLL_MS);
      }
    };
    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [visible]);

  // Game clock only while a round is live.
  useEffect(() => {
    if (!visible || !running) return;
    const id = setInterval(() => dispatch({ type: 'tick', now: Date.now() }), TICK_MS);
    return () => clearInterval(id);
  }, [running, visible]);

  // Closing the arcade stops the run; nothing keeps ticking in the background.
  useEffect(() => {
    if (!visible) dispatch({ type: 'quit' });
  }, [visible]);

  // Persist personal best per mode when a run ends. Never write over stored bests we failed to read.
  const savedRun = useRef(false);
  useEffect(() => {
    if (game.phase !== 'over') { savedRun.current = false; return; }
    if (savedRun.current) return;
    savedRun.current = true;
    if (game.score > bests[game.mode]) {
      const next = { ...bests, [game.mode]: game.score };
      setBests(next);
      setNewBest(true);
      if (storage === 'ready') writeBests(next);
      else { setPendingSave(next); setSaveError('Saved bests could not be read, so this score was not saved.'); }
    } else setNewBest(false);
  }, [bests, game.mode, game.phase, game.score, storage, writeBests]);

  // A late successful load re-merges and saves any score held back.
  useEffect(() => {
    if (storage === 'ready' && pendingSave && !saveError.startsWith('Your')) writeBests({
      watch: Math.max(pendingSave.watch, bests.watch), touch: Math.max(pendingSave.touch, bests.touch),
    });
  }, [bests, pendingSave, saveError, storage, writeBests]);

  useEffect(() => {
    if (game.phase !== 'cue' || calm) { pulse.setValue(0); return; }
    pulse.setValue(0);
    const animation = Animated.timing(pulse, { toValue: 1, duration: 260, easing: Easing.out(Easing.back(2)), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [calm, game.phase, game.round, pulse]);

  const start = (mode: ParryMode) => {
    if (storage === 'loading' || (mode === 'watch' && !fresh)) return;
    setNewBest(false);
    dispatch({ type: 'start', mode, now: Date.now(), gestureId: mode === 'watch' ? latestGesture.current : null });
  };
  const close = () => { dispatch({ type: 'quit' }); onClose(); };

  const seed = game.round * 7 + game.score;
  const prompt = game.phase === 'cue' && game.cue
    ? pickLine(ARCADE_PROMPTS[game.cue], game.round)
    : game.phase === 'rest' ? pickLine(ARCADE_PROMPTS.rest, game.round) : '';
  const bark = game.outcome ? pickLine(BATTLE_BARKS[game.outcome], seed) : '';
  const rank = rankForParryScore(game.score);
  const cueColor = game.cue === 'hold' ? colors.accentForeground : colors.primary;
  const watchStatus = pollError
    ? pollError
    : !motion ? 'Listening for the watch relay…'
      : !motion.available ? (motion.status || 'Watch motion is not available on this device.')
        : !motion.connected ? (motion.status || 'Watch not connected.')
          : fresh ? `Live · ${motion.magnitude !== null ? `${motion.magnitude.toFixed(2)} m/s²` : 'motion'}`
            : 'Watch data is stale — start wrist controls on the watch and check the phone bridge.';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <SafeAreaView style={[styles.panel, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <MaterialCommunityIcons name="paw" size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.kicker, { color: colors.primary }]}>GUILD ARCADE · PRACTICE ONLY</Text>
              <Text style={[styles.title, { color: colors.foreground }]}>PAW PARRY</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close Paw Parry" onPress={close}
              style={[styles.iconButton, { backgroundColor: colors.secondary }]}>
              <Feather name="x" size={18} color={colors.foreground} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body}>
            <View style={[styles.statusRow, { borderColor: fresh ? colors.primary : colors.border, backgroundColor: colors.secondary }]}>
              <View style={[styles.dot, { backgroundColor: fresh ? colors.primary : colors.destructive }]} />
              <Text style={[styles.statusText, { color: colors.foreground }]} numberOfLines={2}>{watchStatus}</Text>
            </View>

            <View style={[styles.stage, { borderColor: running ? cueColor : colors.border, backgroundColor: colors.card }]}>
              {game.phase === 'idle' && (
                <>
                  <Text style={[styles.big, { color: colors.foreground }]}>Ready, guildmate?</Text>
                  <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                    GO rune: one small wrist flick. HOLD rune: keep still. Three hearts per run.
                  </Text>
                </>
              )}
              {running && (
                <Animated.View style={{ alignItems: 'center', gap: 8, transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }}>
                  {game.phase === 'cue' && (
                    <MaterialCommunityIcons name={game.cue === 'hold' ? 'hand-back-left' : 'paw'} size={56} color={cueColor} />
                  )}
                  <Text style={[game.phase === 'cue' ? styles.cue : styles.restPrompt, { color: game.phase === 'cue' ? cueColor : colors.mutedForeground }]}>
                    {prompt}
                  </Text>
                  {!!bark && <Text style={[styles.bark, { color: colors.foreground }]}>{bark}</Text>}
                </Animated.View>
              )}
              {game.phase === 'paused' && (
                <>
                  <Feather name={game.pauseReason === 'sensor' ? 'wifi-off' : 'pause'} size={34} color={colors.accentForeground} />
                  <Text style={[styles.big, { color: colors.foreground }]}>
                    {game.pauseReason === 'sensor' ? 'Watch signal lost' : 'Paused'}
                  </Text>
                  <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                    {game.pauseReason === 'sensor'
                      ? 'Reconnect the watch. The run resumes automatically with a short grace period once fresh data returns.'
                      : 'Swings while paused are ignored when you resume.'}
                  </Text>
                </>
              )}
              {game.phase === 'over' && (
                <>
                  <Text style={[styles.big, { color: colors.foreground }]}>{newBest ? 'New personal best!' : 'Run complete'}</Text>
                  <Text style={[styles.cue, { color: colors.primary }]}>{game.score}</Text>
                  <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                    {rank.title} · best combo {game.bestCombo} · {game.mode === 'touch' ? 'touch practice' : 'watch'} run
                  </Text>
                </>
              )}
            </View>

            {game.phase !== 'idle' && (
              <View style={styles.hud}>
                <Hud label="SCORE" value={String(game.score)} colors={colors} />
                <Hud label="COMBO" value={`×${game.combo}`} colors={colors} />
                <Hud label="ROUND" value={String(game.round + 1)} colors={colors} />
                <View style={styles.hearts} accessibilityLabel={`${game.lives} of ${PARRY_LIVES} hearts left`}>
                  {Array.from({ length: PARRY_LIVES }, (_, i) => (
                    <MaterialCommunityIcons key={i} name={i < game.lives ? 'heart' : 'heart-outline'} size={18}
                      color={i < game.lives ? colors.primary : colors.mutedForeground} />
                  ))}
                </View>
              </View>
            )}

            <View style={styles.rankLine}>
              {Array.from({ length: 5 }, (_, i) => (
                <MaterialCommunityIcons key={i} name="paw" size={14} color={i < rank.paws ? colors.primary : colors.muted} />
              ))}
              <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                {'  '}Best · watch {bests.watch} · touch practice {bests.touch}
              </Text>
            </View>

            {(storage !== 'ready' || !!saveError) && (
              <View style={[styles.statusRow, { borderColor: colors.destructive, backgroundColor: colors.secondary }]}>
                <Feather name={storage === 'loading' ? 'loader' : 'alert-triangle'} size={14} color={colors.accentForeground} />
                <Text style={[styles.statusText, { color: colors.foreground }]}>
                  {storage === 'loading' ? 'Loading saved bests…'
                    : saveError || 'Saved bests could not be read. You can still play, but new bests will not be saved until they load.'}
                </Text>
                {storage === 'error' && (
                  <Pressable accessibilityRole="button" accessibilityLabel="Retry loading saved bests" onPress={loadBests}>
                    <Text style={[styles.statusText, { color: colors.primary, flex: 0 }]}>Retry load</Text>
                  </Pressable>
                )}
                {storage === 'ready' && !!pendingSave && (
                  <Pressable accessibilityRole="button" accessibilityLabel="Retry saving best score" onPress={() => writeBests(pendingSave)}>
                    <Text style={[styles.statusText, { color: colors.primary, flex: 0 }]}>Retry save</Text>
                  </Pressable>
                )}
              </View>
            )}

            <View style={styles.actions}>
              {(game.phase === 'idle' || game.phase === 'over') && (
                <>
                  <ArcadeButton icon="watch" label={fresh ? 'Start with watch' : 'Waiting for live watch data'}
                    primary disabled={!fresh || storage === 'loading'} onPress={() => start('watch')} colors={colors} />
                  <ArcadeButton icon="mouse-pointer" label="Touch practice (no watch)" disabled={storage === 'loading'} onPress={() => start('touch')} colors={colors} />
                </>
              )}
              {running && game.mode === 'touch' && (
                <ArcadeButton icon="zap" label="TAP = SWING" primary big
                  onPress={() => dispatch({ type: 'swing', now: Date.now(), gestureId: null, source: 'touch' })} colors={colors} />
              )}
              {running && (
                <ArcadeButton icon="pause" label="Pause" onPress={() => dispatch({ type: 'pause', now: Date.now() })} colors={colors} />
              )}
              {game.phase === 'paused' && game.pauseReason === 'user' && (
                <ArcadeButton icon="play" label="Resume" primary
                  disabled={game.mode === 'watch' && !fresh}
                  onPress={() => dispatch({ type: 'resume', now: Date.now(), gestureId: latestGesture.current })} colors={colors} />
              )}
              {game.phase !== 'idle' && (
                <ArcadeButton icon="log-out" label="End run" onPress={() => dispatch({ type: 'quit' })} colors={colors} />
              )}
            </View>

            <View style={[styles.safety, { borderColor: colors.border }]}>
              <Feather name="shield" size={14} color={colors.accentForeground} />
              <Text style={[styles.muted, { color: colors.mutedForeground, flex: 1 }]}>
                Play seated with the watch strap snug. Small wrist flicks only — no big arm swings. Watch mode reads real motion
                from your paired watch; the phone itself is never used as a motion sensor. Paw Parry scores never count as dungeon
                defeats, coins, or XP.
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function Hud({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.hudCell, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
      <Text style={[styles.hudLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.hudValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

function ArcadeButton({ icon, label, onPress, primary = false, disabled = false, big = false, colors }: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  big?: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, big && styles.bigButton, {
        backgroundColor: primary ? colors.primary : colors.secondary,
        borderColor: primary ? colors.primary : colors.border,
        opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
      }]}>
      <Feather name={icon} size={big ? 22 : 16} color={primary ? colors.primaryForeground : colors.foreground} />
      <Text style={[styles.buttonText, big && { fontSize: 18 }, { color: primary ? colors.primaryForeground : colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  panel: { width: '100%', maxWidth: 640, maxHeight: '100%', borderWidth: 1, borderRadius: 4, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1 },
  kicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.6 },
  title: { fontSize: 20, fontWeight: '900', letterSpacing: 3 },
  iconButton: { width: 40, height: 40, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 14, gap: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 4, padding: 10 },
  dot: { width: 9, height: 9 },
  statusText: { flex: 1, fontSize: 12, fontWeight: '600' },
  stage: { minHeight: 210, borderWidth: 2, borderRadius: 4, alignItems: 'center', justifyContent: 'center', padding: 18, gap: 8 },
  big: { fontSize: 20, fontWeight: '900', textAlign: 'center' },
  cue: { fontSize: 44, fontWeight: '900', letterSpacing: 4, textAlign: 'center' },
  restPrompt: { fontSize: 16, fontStyle: 'italic', letterSpacing: 1 },
  bark: { fontSize: 14, fontWeight: '700' },
  muted: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
  hud: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  hudCell: { flex: 1, borderWidth: 1, borderRadius: 4, paddingVertical: 6, alignItems: 'center' },
  hudLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1.4 },
  hudValue: { fontSize: 17, fontWeight: '900', fontVariant: ['tabular-nums'] },
  hearts: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  rankLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' },
  actions: { gap: 8 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46, borderWidth: 1, borderRadius: 4, paddingHorizontal: 14 },
  bigButton: { minHeight: 84 },
  buttonText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.6 },
  safety: { flexDirection: 'row', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 4, padding: 10 },
});
