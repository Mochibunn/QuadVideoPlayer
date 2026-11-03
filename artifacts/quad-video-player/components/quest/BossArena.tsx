import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { GameText as Text } from '@/components/GameText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import type { CombatControlScheme } from '@/lib/input-controls';
import {
  BOSS_MAX_FOCUS, hasCounter, isStunned, isWeakOpen, requiredDefense, type BossDefense, type BossState,
} from '@/lib/boss-mechanics';
import { COMBAT_HIT_SLOP, combatPress } from '@/components/quest/press';

type Props = {
  boss: BossState;
  result: 'victory' | 'escaped' | null;
  resultMessage: string;
  name: string;
  imageUri: string | null;
  videoName: string;
  remainingSeconds: number;
  playing: boolean;
  calm: boolean;
  controlScheme: CombatControlScheme;
  skillName: string;
  spellName: string;
  onStrike: () => void;
  onDefend: (defense: BossDefense) => void;
  onSkill: () => void;
  onSpell: () => void;
  onExit: () => void;
};

/** Transparent full-screen boss layer: the boss video stays visible beneath every element. */
export default function BossArena(props: Props) {
  const colors = useColors();
  const { boss, result } = props;
  const pulse = useRef(new Animated.Value(0)).current;
  const weak = isWeakOpen(boss);
  const stunned = isStunned(boss);
  const counter = hasCounter(boss);
  const active = !result && props.playing;

  useEffect(() => {
    if (!active || !boss.beatMs || props.calm) {
      pulse.setValue(0);
      return;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: Math.max(70, boss.beatMs * 0.18), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: Math.max(80, boss.beatMs * 0.82), useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [active, boss.beatMs, props.calm, pulse]);

  const hpRatio = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
  const attack = boss.attack;
  const telegraphRatio = attack
    ? Math.max(0, Math.min(1, (attack.resolveAt - boss.clockMs) / Math.max(1, attack.resolveAt - attack.startedAt)))
    : 0;
  const skillLeft = Math.max(0, boss.skillReadyAt - boss.clockMs);
  const spellLeft = Math.max(0, boss.spellReadyAt - boss.clockMs);
  const ringColor = weak ? colors.primary : counter ? colors.foreground : colors.border;

  return (
    <View style={styles.layer} pointerEvents="box-none">
      <SafeAreaView style={styles.safe} pointerEvents="box-none">
        <View style={styles.topBar}>
          <View style={styles.label}>
            <Text style={[styles.kicker, { color: colors.primary }]}>
              VIDEO BOSS · PHASE {boss.phase}/3 {!props.playing && !result ? '· PAUSED' : ''}
            </Text>
            <Text numberOfLines={1} style={[styles.videoName, { color: colors.foreground }]}>{props.videoName}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Leave boss fight" onPress={props.onExit} hitSlop={8}
            style={[styles.exit, { borderColor: colors.border }]}>
            <Feather name="x" size={18} color={colors.foreground} />
          </Pressable>
        </View>

        <View style={styles.center} pointerEvents="box-none">
          {attack && !result && (
            <View accessibilityLiveRegion="assertive" style={[styles.telegraph, { borderColor: colors.destructive }]}>
              <Text style={[styles.telegraphText, { color: colors.foreground }]}>
                {attack.kind === 'sweep' ? 'SWEEP' : 'SLAM'} · {requiredDefense[attack.kind] === 'dodge' ? 'DODGE' : 'GUARD'}
              </Text>
              <View style={styles.telegraphTrack}>
                <View style={[styles.telegraphFill, { backgroundColor: colors.destructive, width: `${telegraphRatio * 100}%` }]} />
              </View>
            </View>
          )}
          <Animated.View style={[styles.portraitFrame, {
            borderColor: ringColor,
            borderWidth: weak ? 5 : 3,
            opacity: stunned ? 0.55 : 1,
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) }],
          }]}>
            <Pressable accessibilityRole="button"
              accessibilityLabel={weak ? 'Strike the open weak point' : 'Strike the boss'}
              disabled={!!result || !props.playing}
              hitSlop={COMBAT_HIT_SLOP}
              {...combatPress(props.controlScheme, props.onStrike)}
              style={styles.portraitButton}>
              {props.imageUri ? (
                <Image source={{ uri: props.imageUri }} contentFit="cover" style={styles.portrait} />
              ) : (
                <View style={[styles.portraitFallback, { backgroundColor: colors.secondary }]}>
                  <Feather name="shield" size={64} color={colors.primary} />
                </View>
              )}
              {weak && (
                <View pointerEvents="none" style={[styles.weakBadge, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.weakText, { color: colors.primaryForeground }]}>WEAK POINT</Text>
                </View>
              )}
            </Pressable>
          </Animated.View>
          <Text style={[styles.bossName, { color: colors.foreground }]}>{props.name}</Text>
        </View>

        <View style={[styles.hud, { borderColor: colors.border }]}>
          {result ? (
            <View style={styles.result}>
              <Text style={[styles.resultTitle, { color: colors.primary }]}>
                {result === 'victory' ? 'BOSS DEFEATED' : 'BOSS ESCAPED'}
              </Text>
              <Text style={[styles.status, { color: colors.foreground, textAlign: 'center' }]}>{props.resultMessage}</Text>
              <Text style={[styles.status, { color: colors.mutedForeground, textAlign: 'center' }]}>
                {boss.counters} counters · {boss.weakHits} weak point hits
              </Text>
              <Pressable accessibilityRole="button" onPress={props.onExit}
                style={[styles.wideButton, { backgroundColor: colors.primary }]}>
                <Text style={[styles.actionText, { color: colors.primaryForeground }]}>Return to the guild</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.meterLine}>
                <Text style={[styles.kicker, { color: colors.foreground }]}>
                  {boss.hp.toLocaleString()} / {boss.maxHp.toLocaleString()} HP
                </Text>
                <Text style={[styles.kicker, { color: colors.primary }]}>{Math.ceil(props.remainingSeconds)}s LEFT</Text>
              </View>
              <View style={[styles.track, { backgroundColor: colors.card }]}>
                <View style={[styles.fill, { backgroundColor: colors.primary, width: `${hpRatio * 100}%` }]} />
                <View style={[styles.tick, { left: '33.3%' }]} />
                <View style={[styles.tick, { left: '66.6%' }]} />
              </View>
              <View style={styles.meterLine}>
                <Text style={[styles.small, { color: colors.mutedForeground }]}>FOCUS</Text>
                <View style={[styles.focusTrack, { backgroundColor: colors.card }]}>
                  <View style={[styles.fill, { backgroundColor: stunned ? colors.destructive : colors.foreground, width: `${(boss.focus / BOSS_MAX_FOCUS) * 100}%` }]} />
                </View>
                <Text style={[styles.small, { color: colors.mutedForeground }]}>x{boss.combo}</Text>
              </View>
              <Text numberOfLines={2} style={[styles.status, { color: colors.foreground }]}>
                {!props.playing ? 'Video paused. The fight is frozen until playback resumes.' : boss.event}
                {boss.beatMs ? ` · ${Math.round(60_000 / boss.beatMs)} BPM` : ''}
              </Text>
              <View style={styles.actions}>
                <BossButton label={counter ? 'Counter!' : 'Strike'} icon="target" primary
                  disabled={!props.playing || stunned} scheme={props.controlScheme} onAct={props.onStrike} />
                <BossButton label="Guard" icon="shield" highlight={attack?.kind === 'slam'}
                  disabled={!props.playing || stunned} scheme={props.controlScheme} onAct={() => props.onDefend('guard')} />
                <BossButton label="Dodge" icon="wind" highlight={attack?.kind === 'sweep'}
                  disabled={!props.playing || stunned} scheme={props.controlScheme} onAct={() => props.onDefend('dodge')} />
                <BossButton label={skillLeft ? `${(skillLeft / 1000).toFixed(1)}s` : props.skillName} icon="crosshair"
                  disabled={!props.playing || stunned || skillLeft > 0} scheme={props.controlScheme} onAct={props.onSkill} />
                <BossButton label={spellLeft ? `${(spellLeft / 1000).toFixed(1)}s` : props.spellName} icon="zap"
                  disabled={!props.playing || stunned || spellLeft > 0} scheme={props.controlScheme} onAct={props.onSpell} />
              </View>
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

function BossButton({ label, icon, onAct, disabled, primary, highlight, scheme }: {
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  onAct: () => void;
  disabled?: boolean;
  primary?: boolean;
  highlight?: boolean;
  scheme: CombatControlScheme;
}) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} hitSlop={6}
      {...combatPress(scheme, onAct)}
      style={({ pressed }) => [styles.action, {
        backgroundColor: primary ? colors.primary : highlight ? colors.accent : 'rgba(0,0,0,0.55)',
        borderColor: highlight ? colors.destructive : primary ? colors.primary : colors.border,
        opacity: disabled ? 0.4 : 1,
        transform: [{ scale: pressed ? 0.94 : 1 }],
      }]}>
      <Feather name={icon} size={16} color={primary ? colors.primaryForeground : colors.primary} />
      <Text numberOfLines={1} style={[styles.actionText, { color: primary ? colors.primaryForeground : colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, zIndex: 100, elevation: 100, backgroundColor: 'rgba(0,0,0,0.1)' },
  safe: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 8 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)' },
  kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  videoName: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  exit: { width: 42, height: 42, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  telegraph: { minWidth: 200, borderWidth: 2, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, gap: 5, backgroundColor: 'rgba(0,0,0,0.62)' },
  telegraphText: { fontSize: 14, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  telegraphTrack: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.15)' },
  telegraphFill: { height: '100%' },
  portraitFrame: { width: 220, height: 220, borderRadius: 28, padding: 6, backgroundColor: 'rgba(0,0,0,0.4)' },
  portraitButton: { flex: 1, overflow: 'hidden', borderRadius: 22 },
  portrait: { width: '100%', height: '100%' },
  portraitFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  weakBadge: { position: 'absolute', bottom: 8, alignSelf: 'center', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  weakText: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  bossName: {
    fontSize: 16, fontWeight: '900', textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  hud: { borderWidth: 1, borderRadius: 14, padding: 11, gap: 7, backgroundColor: 'rgba(0,0,0,0.66)' },
  meterLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  track: { height: 10, borderRadius: 4, overflow: 'hidden' },
  tick: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(0,0,0,0.7)' },
  focusTrack: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%' },
  small: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  status: { fontSize: 11, lineHeight: 15 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  action: { flexGrow: 1, minWidth: 92, minHeight: 50, borderWidth: 1, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  actionText: { fontSize: 12, fontWeight: '900' },
  wideButton: { minHeight: 46, alignSelf: 'stretch', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  result: { alignItems: 'center', gap: 8 },
  resultTitle: { fontSize: 16, fontWeight: '900', letterSpacing: 1.4 },
});
