import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent,
} from 'react-native';
import { GameText as Text } from '@/components/GameText';
import SettingSwitch from '@/components/SettingSwitch';
import TouchSlider from '@/components/TouchSlider';
import { useColors } from '@/hooks/useColors';
import {
  applyPositionPreset, DEFAULT_SESSION_STATS, formatClock, isValidHeartRate, overlayOrigin,
  parseSessionStatsSettings, SESSION_STATS_OVERLAY_KEY, STATS_COLOR_OPTIONS, STATS_FIXED_COLORS, STATS_FONT_MAX,
  STATS_FONT_MIN, STATS_POSITION_PRESETS, type HeartRateAggregate, type SessionStatsSettings,
} from '@/lib/session-stats-overlay';

export type SessionStatsOverlayProps = {
  elapsedMs: number;
  heartRate: number | null;
  recordedHeartRate?: HeartRateAggregate | null;
  videosWatched: number;
  lifetimeVideosWatched: number;
  poolSize: number;
  averageBpm: number | null;
  isPlaying: boolean;
  settingsVisible: boolean;
  onCloseSettings: () => void;
};

function useSessionStatsSettings() {
  const [settings, setSettings] = useState<SessionStatsSettings>(DEFAULT_SESSION_STATS);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const writable = useRef(false);
  const load = useCallback(() => {
    setError('');
    setReady(false);
    AsyncStorage.getItem(SESSION_STATS_OVERLAY_KEY)
      .then((raw) => { setSettings(parseSessionStatsSettings(raw)); writable.current = true; })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not read stats overlay settings.'))
      .finally(() => setReady(true));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    if (!ready || !writable.current) return;
    const snapshot = JSON.stringify(settings);
    const timer = setTimeout(() => {
      AsyncStorage.setItem(SESSION_STATS_OVERLAY_KEY, snapshot)
        .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not save stats overlay settings.'));
    }, 250);
    return () => clearTimeout(timer);
  }, [ready, settings]);
  const reset = useCallback(() => {
    AsyncStorage.removeItem(SESSION_STATS_OVERLAY_KEY).catch(() => undefined);
    writable.current = true;
    setSettings({ ...DEFAULT_SESSION_STATS });
    setError('');
  }, []);
  return { settings, setSettings, ready, error, retry: load, reset };
}

export default function SessionStatsOverlay({
  elapsedMs, heartRate, recordedHeartRate, videosWatched, lifetimeVideosWatched, poolSize, averageBpm, isPlaying, settingsVisible, onCloseSettings,
}: SessionStatsOverlayProps) {
  const colors = useColors();
  const { settings, setSettings, ready, error, retry, reset } = useSessionStatsSettings();
  const [view, setView] = useState({ w: 0, h: 0 });
  const [box, setBox] = useState({ w: 0, h: 0 });
  const range = recordedHeartRate ?? null;
  const [fontDraft, setFontDraft] = useState<number | null>(null);
  const [xDraft, setXDraft] = useState<number | null>(null);
  const [yDraft, setYDraft] = useState<number | null>(null);
  const hrValid = isValidHeartRate(heartRate);
  const heartbeat = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    heartbeat.stopAnimation();
    heartbeat.setValue(1);
    if (!hrValid || !settings.showHeartRate) return;
    const period = 60_000 / Math.max(25, Math.min(250, Math.round(heartRate!)));
    const first = Math.max(55, Math.min(120, period * 0.18));
    const second = Math.max(55, Math.min(120, period * 0.18));
    const third = Math.max(55, Math.min(120, period * 0.18));
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(heartbeat, { toValue: 1.32, duration: first, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(heartbeat, { toValue: 1, duration: second, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(heartbeat, { toValue: 1.16, duration: third, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(heartbeat, { toValue: 1, duration: Math.max(70, period - first - second - third), easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [heartbeat, heartRate, hrValid, settings.showHeartRate]);

  const patch = (next: Partial<SessionStatsSettings>) => setSettings((current) => ({ ...current, ...next }));
  const tint = settings.color === 'theme' ? colors.primary : STATS_FIXED_COLORS[settings.color];
  const fontSize = fontDraft ?? settings.fontSize;
  const x = xDraft ?? settings.x;
  const y = yDraft ?? settings.y;
  const origin = overlayOrigin(view.w, view.h, box.w, box.h, x, y);
  const rows: { key: string; icon: keyof typeof Feather.glyphMap; label: string; value: string }[] = [];
  if (settings.showTime) rows.push({ key: 'time', icon: 'clock', label: 'TIME', value: formatClock(elapsedMs) });
  if (settings.showHeartRate) rows.push({ key: 'hr', icon: 'heart', label: 'HR', value: hrValid ? `${Math.round(heartRate)} bpm` : '—' });
  if (settings.showHeartRange) rows.push({ key: 'range', icon: 'activity', label: 'MIN/MAX', value: range ? `${Math.round(range.min)} / ${Math.round(range.max)}` : '—' });
  if (settings.showVideos) rows.push({ key: 'vid', icon: 'film', label: 'VIDEOS', value: `${videosWatched} / ${poolSize}` });
  if (settings.showLifetimeVideos) rows.push({ key: 'lifetime-videos', icon: 'video', label: 'TOTAL VIDEOS', value: String(lifetimeVideosWatched) });
  if (settings.showAverageBpm) rows.push({ key: 'bpm', icon: 'music', label: 'AVG VIDEO BPM', value: averageBpm != null && Number.isFinite(averageBpm) ? String(Math.round(averageBpm)) : '—' });
  const disabled = !ready || !!error;
  const showReadout = settings.enabled && rows.length > 0;

  const onView = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setView((c) => c.w === width && c.h === height ? c : { w: width, h: height });
  };
  const onBox = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((c) => c.w === width && c.h === height ? c : { w: width, h: height });
  };
  const outline = { textShadowColor: 'rgba(0,0,0,0.95)', textShadowOffset: { width: 1, height: 1.5 }, textShadowRadius: 3 };

  return (
    <>
      {showReadout && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={onView}>
          <View onLayout={onBox} style={[styles.readout, { left: origin.left, top: origin.top, opacity: view.w ? 1 : 0 }]}>
            {rows.map((row) => (
              <View key={row.key} style={styles.row}>
                {row.key === 'hr'
                  ? <Animated.View style={{ transform: [{ scale: heartbeat }] }}>
                    <Feather name={row.icon} size={Math.round(fontSize * 0.85)} color={tint} style={outline} />
                  </Animated.View>
                  : <Feather name={row.icon} size={Math.round(fontSize * 0.85)} color={tint} style={outline} />}
                <Text style={[styles.label, outline, { color: tint, fontSize: Math.max(8, fontSize * 0.55) }]}>{row.label}</Text>
                <Text style={[styles.value, outline, { color: colors.foreground, fontSize }]}>{row.value}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
      <Modal visible={settingsVisible} transparent animationType="fade" onRequestClose={onCloseSettings}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.backdrop}>
          <View style={[styles.panel, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.kicker, { color: colors.primary }]}>HUD SCROLL</Text>
                <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>Session stats overlay</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close stats settings" onPress={onCloseSettings} style={styles.iconButton}>
                <Feather name="x" size={20} color={colors.foreground} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              {!ready && <Text style={[styles.hint, { color: colors.mutedForeground }]}>Loading overlay settings…</Text>}
              {!!error && (
                <View style={[styles.errorBox, { borderColor: colors.destructive }]}>
                  <Text style={[styles.hint, { color: colors.destructive }]}>{error}</Text>
                  <View style={styles.chips}>
                    <Pressable accessibilityRole="button" onPress={retry} style={[styles.chip, { borderColor: colors.border }]}>
                      <Text style={[styles.chipText, { color: colors.primary }]}>Retry</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={reset} style={[styles.chip, { borderColor: colors.border }]}>
                      <Text style={[styles.chipText, { color: colors.foreground }]}>Reset to defaults</Text>
                    </Pressable>
                  </View>
                </View>
              )}
              {([
                ['enabled', 'Show overlay', 'Floats over the videos; touches pass through.'],
                ['showTime', 'Session time', 'Active playback time only.'],
                ['showHeartRate', 'Heart rate', 'Live reading from your watch. Shows — with no signal.'],
                ['showHeartRange', 'Heart min / max', 'From real samples since this overlay started.'],
                ['showVideos', 'Videos watched', 'Unique videos this session / pool size.'],
                ['showLifetimeVideos', 'Total videos watched', 'All-time unique video starts recorded in the leaderboard.'],
                ['showAverageBpm', 'Average video BPM', 'Mean detected music tempo of the playing videos.'],
              ] as const).map(([key, label, hint]) => (
                <View key={key} style={styles.settingRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label2, { color: colors.foreground }]}>{label}</Text>
                    <Text style={[styles.hint, { color: colors.mutedForeground }]}>{hint}</Text>
                  </View>
                  <SettingSwitch label={label} value={settings[key]} disabled={disabled}
                    onValueChange={(value) => patch({ [key]: value } as Partial<SessionStatsSettings>)} />
                </View>
              ))}
              <Text style={[styles.label2, { color: colors.foreground }]}>Ink</Text>
              <View style={styles.chips}>
                {STATS_COLOR_OPTIONS.map((option) => {
                  const swatch = option.id === 'theme' ? colors.primary : STATS_FIXED_COLORS[option.id];
                  const selected = settings.color === option.id;
                  return (
                    <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }}
                      disabled={disabled} onPress={() => patch({ color: option.id })}
                      style={[styles.chip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.accent : 'transparent' }]}>
                      <View style={[styles.dot, { backgroundColor: swatch }]} />
                      <Text style={[styles.chipText, { color: colors.foreground }]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.settingRow}>
                <Text style={[styles.label2, { color: colors.foreground }]}>Text size</Text>
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>{fontSize}px</Text>
              </View>
              <TouchSlider style={styles.slider} accessibilityLabel="Overlay text size"
                minimumValue={STATS_FONT_MIN} maximumValue={STATS_FONT_MAX} step={1} value={settings.fontSize} disabled={disabled}
                onDraftValueChange={(v) => setFontDraft(Math.round(v))}
                onSlidingComplete={(v) => { setFontDraft(null); patch({ fontSize: Math.round(v) }); }}
                minimumTrackTintColor={colors.primary} maximumTrackTintColor={colors.mutedForeground} thumbTintColor={colors.primary} />
              <Text style={[styles.label2, { color: colors.foreground }]}>Position</Text>
              <View style={styles.chips}>
                {STATS_POSITION_PRESETS.map((preset) => {
                  const selected = settings.position === preset.id;
                  return (
                    <Pressable key={preset.id} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }}
                      disabled={disabled} onPress={() => setSettings((c) => applyPositionPreset(c, preset.id))}
                      style={[styles.chip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.accent : 'transparent' }]}>
                      <Text style={[styles.chipText, { color: colors.foreground }]}>{preset.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.settingRow}>
                <Text style={[styles.label2, { color: colors.foreground }]}>Horizontal</Text>
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>{x}%</Text>
              </View>
              <TouchSlider style={styles.slider} accessibilityLabel="Overlay horizontal position"
                minimumValue={0} maximumValue={100} step={1} value={settings.x} disabled={disabled}
                onDraftValueChange={(v) => setXDraft(Math.round(v))}
                onSlidingComplete={(v) => { setXDraft(null); patch({ x: Math.round(v), position: 'custom' }); }}
                minimumTrackTintColor={colors.primary} maximumTrackTintColor={colors.mutedForeground} thumbTintColor={colors.primary} />
              <View style={styles.settingRow}>
                <Text style={[styles.label2, { color: colors.foreground }]}>Vertical</Text>
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>{y}%</Text>
              </View>
              <TouchSlider style={styles.slider} accessibilityLabel="Overlay vertical position"
                minimumValue={0} maximumValue={100} step={1} value={settings.y} disabled={disabled}
                onDraftValueChange={(v) => setYDraft(Math.round(v))}
                onSlidingComplete={(v) => { setYDraft(null); patch({ y: Math.round(v), position: 'custom' }); }}
                minimumTrackTintColor={colors.primary} maximumTrackTintColor={colors.mutedForeground} thumbTintColor={colors.primary} />
            </ScrollView>
            <Pressable accessibilityRole="button" onPress={onCloseSettings} style={[styles.done, { backgroundColor: colors.primary }]}>
              <Text style={[styles.doneText, { color: colors.primaryForeground }]}>Done</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  readout: { position: 'absolute', gap: 2, padding: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontWeight: '900', letterSpacing: 1 },
  value: { fontWeight: '800', fontVariant: ['tabular-nums'] },
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 14, backgroundColor: 'rgba(0,0,0,0.82)' },
  panel: { width: '94%', maxWidth: 480, maxHeight: '90%', padding: 18, borderRadius: 20, borderWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  kicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.6 },
  title: { fontSize: 19, fontWeight: '800' },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  body: { gap: 10, paddingBottom: 8 },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label2: { fontSize: 13, fontWeight: '700' },
  hint: { fontSize: 11, lineHeight: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, minHeight: 34 },
  chipText: { fontSize: 12, fontWeight: '700' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  slider: { width: '100%', height: 44 },
  errorBox: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 8 },
  done: { minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  doneText: { fontSize: 15, fontWeight: '800' },
});
