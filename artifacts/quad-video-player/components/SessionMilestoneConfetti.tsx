import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

type Particle = { x: number; drift: number; size: number; spin: number; start: number; color: string };

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
  const { width, height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const palette = [colors.primary, colors.accentForeground, colors.destructive, '#ffd248', '#109b61'];
  const particles = useMemo<Particle[]>(() => Array.from({ length: 32 }, (_, index) => ({
    x: Math.random() * width,
    drift: (Math.random() - 0.5) * 150,
    size: 5 + Math.random() * 6,
    spin: 180 + Math.random() * 720,
    start: Math.random() * 100,
    color: palette[index % palette.length],
  })), [width, colors.primary, colors.accentForeground, colors.destructive]);

  useEffect(() => {
    if (milestoneMs === null) return;
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 4_500,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start(({ finished }) => {
      if (finished) onDoneRef.current();
    });
    return () => animation.stop();
  }, [milestoneMs, progress]);

  if (milestoneMs === null) return null;
  const minutes = Math.round(milestoneMs / 60_000);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {particles.map((particle, index) => {
        const translateY = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [-40 - particle.start, height + 80],
        });
        const translateX = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [particle.x, particle.x + particle.drift],
        });
        const opacity = progress.interpolate({
          inputRange: [0, 0.75, 1],
          outputRange: [1, 1, 0],
        });
        const rotate = progress.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', `${particle.spin}deg`],
        });
        return (
          <Animated.View
            key={index}
            style={[
              styles.particle,
              { width: particle.size, height: particle.size * 1.7, backgroundColor: particle.color, opacity,
                transform: [{ translateX }, { translateY }, { rotate }] },
            ]}
          />
        );
      })}
      <View style={[styles.banner, { backgroundColor: colors.playbackOverlay, borderColor: colors.primary }]}>
        <Text style={[styles.kicker, { color: colors.primary }]}>{minutes}-MINUTE MILESTONE · +10 XP</Text>
        <Text accessibilityLiveRegion="polite" style={[styles.message, { color: colors.foreground }]}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  particle: { position: 'absolute', left: 0, top: 0, borderRadius: 2 },
  banner: {
    position: 'absolute', top: '24%', alignSelf: 'center', maxWidth: '86%', minWidth: 260,
    paddingVertical: 15, paddingHorizontal: 22, borderRadius: 16, borderWidth: 1,
    alignItems: 'center', gap: 6,
  },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1.1, textAlign: 'center' },
  message: { fontSize: 19, lineHeight: 25, fontWeight: '700', textAlign: 'center' },
});
