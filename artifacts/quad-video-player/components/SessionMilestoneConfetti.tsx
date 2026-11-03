import { Feather } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

type Particle = { x: number; drift: number; size: number; spin: number; start: number; color: string };

/** Achievement-style pill (top centre) plus falling ribbons; fires once per milestone value. */
export default function SessionMilestoneConfetti({
  milestoneMs,
  message,
  onDone,
}: {
  milestoneMs: number | null;
  message: string;
  onDone: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const pill = useRef(new Animated.Value(0)).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const palette = [colors.primary, '#5BCEFA', '#F5A9B8', '#ffd248', '#f2eefb'];
  const particles = useMemo<Particle[]>(() => Array.from({ length: 36 }, (_, index) => ({
    x: Math.random() * width,
    drift: (Math.random() - 0.5) * 150,
    size: 5 + Math.random() * 6,
    spin: 180 + Math.random() * 720,
    start: Math.random() * 100,
    color: palette[index % palette.length],
  })), [width, colors.primary]);

  useEffect(() => {
    if (milestoneMs === null) return;
    progress.setValue(0);
    pill.setValue(0);
    const animation = Animated.parallel([
      Animated.timing(progress, { toValue: 1, duration: 4_500, easing: Easing.out(Easing.quad), useNativeDriver: true, isInteraction: false }),
      Animated.sequence([
        Animated.spring(pill, { toValue: 1, useNativeDriver: true, friction: 7, tension: 70, isInteraction: false }),
        Animated.delay(3_600),
        Animated.timing(pill, { toValue: 0, duration: 380, useNativeDriver: true, isInteraction: false }),
      ]),
    ]);
    animation.start(({ finished }) => { if (finished) onDoneRef.current(); });
    return () => animation.stop();
  }, [milestoneMs, progress, pill]);

  if (milestoneMs === null) return null;
  const minutes = Math.round(milestoneMs / 60_000);
  const pillWidth = Math.min(width - 24 - insets.left - insets.right, 520);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 90, elevation: 90 }]}>
      {particles.map((particle, index) => (
        <Animated.View
          key={index}
          style={[styles.particle, {
            width: particle.size, height: particle.size * 1.7, backgroundColor: particle.color,
            opacity: progress.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [particle.x, particle.x + particle.drift] }) },
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-40 - particle.start, height + 80] }) },
              { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${particle.spin}deg`] }) },
            ],
          }]}
        />
      ))}
      <Animated.View style={[styles.pill, {
        top: insets.top + 14, width: pillWidth, backgroundColor: 'rgba(12,10,18,0.94)', borderColor: colors.primary,
        opacity: pill, transform: [{ translateY: pill.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }, { scale: pill.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
      }]}>
        <View style={[styles.trophy, { backgroundColor: colors.primary }]}>
          <Feather name="award" size={22} color={colors.primaryForeground} />
        </View>
        <View style={styles.pillCopy}>
          <Text numberOfLines={1} style={[styles.kicker, { color: '#ffd248' }]}>ACHIEVEMENT UNLOCKED · +10 XP</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.title, { color: colors.foreground }]}>{minutes}-minute guild mark</Text>
          {!!message && <Text accessibilityLiveRegion="polite" numberOfLines={2} style={[styles.message, { color: colors.mutedForeground }]}>{message}</Text>}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  particle: { position: 'absolute', left: 0, top: 0, borderRadius: 2 },
  pill: {
    position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 9, paddingLeft: 9, paddingRight: 18, borderRadius: 999, borderWidth: 1.5,
  },
  trophy: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  pillCopy: { flex: 1, minWidth: 0 },
  kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { fontSize: 16, fontWeight: '900' },
  message: { fontSize: 12, lineHeight: 16, marginTop: 1 },
});
