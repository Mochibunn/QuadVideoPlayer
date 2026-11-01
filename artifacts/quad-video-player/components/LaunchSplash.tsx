import { Feather } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import { getThemeColors, themePresets } from '@/constants/colors';

const colors = getThemeColors('amethyst');
const tiles = [
  { icon: 'play', color: colors.primary },
  { icon: 'shuffle', color: themePresets[10].primary },
  { icon: 'music', color: themePresets[12].primary },
  { icon: 'repeat', color: themePresets[4].primary },
] as const;

/** A short native welcome animation; no video player or network needed. */
export default function LaunchSplash({ onFinish }: { onFinish: () => void }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const entrances = useRef(tiles.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    let cancelled = false;
    let animation: Animated.CompositeAnimation | undefined;
    let reducedMotionTimer: ReturnType<typeof setTimeout> | undefined;
    AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((reduceMotion) => {
      if (cancelled) return;
      if (reduceMotion) {
        entrances.forEach((value) => value.setValue(1));
        reducedMotionTimer = setTimeout(onFinish, 500);
        return;
      }
      animation = Animated.sequence([
        Animated.stagger(95, entrances.map((value) => Animated.spring(value, {
          toValue: 1,
          friction: 6,
          tension: 110,
          useNativeDriver: true,
        }))),
        Animated.delay(350),
        Animated.timing(opacity, { toValue: 0, duration: 240, useNativeDriver: true }),
      ]);
      animation.start(({ finished }) => {
        if (finished && !cancelled) onFinish();
      });
    });
    return () => {
      cancelled = true;
      animation?.stop();
      if (reducedMotionTimer) clearTimeout(reducedMotionTimer);
    };
  }, [entrances, onFinish, opacity]);

  return (
    <Animated.View
      accessibilityLabel="Quad Video Player. Four screens, endless possibilities."
      accessibilityViewIsModal
      style={[styles.overlay, { opacity }]}
    >
      <View style={styles.mark}>
        {tiles.map((tile, index) => (
          <Animated.View
            key={tile.icon}
            style={[
              styles.tile,
              {
                backgroundColor: tile.color,
                opacity: entrances[index],
                transform: [
                  { translateY: entrances[index].interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) },
                  { scale: entrances[index].interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
                  { rotate: entrances[index].interpolate({ inputRange: [0, 1], outputRange: [index % 2 ? '18deg' : '-18deg', '0deg'] }) },
                ],
              },
            ]}
          >
            <Feather name={tile.icon} size={29} color={colors.background} />
          </Animated.View>
        ))}
      </View>
      <Text style={styles.eyebrow}>PRESS PLAY. MULTIPLY THE FUN.</Text>
      <Text style={styles.title}>QUAD VIDEO PLAYER</Text>
      <Text style={styles.subtitle}>Four screens. Endless possibilities.</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  mark: { width: 164, height: 164, flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 26 },
  tile: { width: 77, height: 77, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 10 },
  title: { color: colors.foreground, fontSize: 24, fontWeight: '700', letterSpacing: 2, textAlign: 'center' },
  subtitle: { color: colors.mutedForeground, fontSize: 13, marginTop: 10 },
});
