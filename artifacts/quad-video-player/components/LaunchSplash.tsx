import React, { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { getThemeColors } from '@/constants/colors';
import PixelFamiliar from '@/components/PixelFamiliar';

const colors = getThemeColors('amethyst');

/** A short native welcome animation; no network or game state is required. */
export default function LaunchSplash({ onFinish }: { onFinish: () => void }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const entrance = useRef(new Animated.Value(0)).current;
  const { width, height } = useWindowDimensions();
  const familiarSize = Math.min(176, width * 0.38, height * 0.3);

  useEffect(() => {
    let cancelled = false;
    let animation: Animated.CompositeAnimation | undefined;
    let reducedMotionTimer: ReturnType<typeof setTimeout> | undefined;
    AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((reduceMotion) => {
      if (cancelled) return;
      if (reduceMotion) {
        entrance.setValue(1);
        reducedMotionTimer = setTimeout(onFinish, 500);
        return;
      }
      animation = Animated.sequence([
        Animated.spring(entrance, {
          toValue: 1,
          friction: 6,
          tension: 105,
          useNativeDriver: true,
        }),
        Animated.delay(420),
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
  }, [entrance, onFinish, opacity]);

  return (
    <Animated.View
      accessibilityLabel="Goon Quest. A moonlit quest with a friendly pixel familiar."
      accessibilityViewIsModal
      style={[styles.overlay, { opacity }]}
    >
      <Animated.View
        style={[
          styles.mascot,
          {
            opacity: entrance,
            transform: [
              { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
              { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.76, 1] }) },
            ],
          },
        ]}
      >
        <PixelFamiliar size={familiarSize} />
      </Animated.View>
      <Text style={styles.eyebrow}>YOUR QUEST BEGINS UNDER THE MOON</Text>
      <Text style={styles.title}>GOON QUEST</Text>
      <Text style={styles.subtitle}>Meet your familiar. Find your kind of magic.</Text>
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
    paddingHorizontal: 22,
  },
  mascot: { alignItems: 'center', justifyContent: 'center', marginBottom: 26 },
  eyebrow: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2.1,
    marginBottom: 11,
    textAlign: 'center',
  },
  title: {
    color: colors.foreground,
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: 2.4,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.mutedForeground,
    fontSize: 13,
    marginTop: 11,
    textAlign: 'center',
  },
});
