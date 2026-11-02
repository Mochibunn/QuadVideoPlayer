import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { getThemeColors } from '@/constants/colors';

const colors = getThemeColors('amethyst');
const sprite = [
  '  PP        PP  ',
  '  PPPP    PPPP  ',
  ' PPPPPP  PPPPPP ',
  ' PPPPPPPPPPPPPP ',
  'PPPPPPPPPPPPPPPP',
  'PPPPPPPPPPPPPPPP',
  'PPPPPPPPPPPPPPPP',
  'PPPPPPPPPPPPPPPP',
  'PPPPHHHHHHHHPPPP',
  'PPPPHHHHHHHHPPPP',
  'PPPPHHBBHHBBPPPP',
  'PPPPHHHHHHHHPPPP',
  'PPPPHHHRRHHHPPPP',
  ' PPPHHHHHHHHPPP ',
  '  PPPPPPPPPPPP  ',
  '   PPPPPPPPPP   ',
];
const pixelColors: Record<string, string> = {
  P: colors.primary,
  H: '#e7ddff',
  B: '#62b8ff',
  R: '#ff657b',
  G: '#72e5a6',
};

type PixelFamiliarProps = {
  size?: number;
  motion?: boolean;
  label?: string;
};

/** A reusable, crisp-edged pixel familiar with small RGB quest sparks. */
export default function PixelFamiliar({
  size = 160,
  motion = true,
  label = 'Pixel familiar',
}: PixelFamiliarProps) {
  const bob = useRef(new Animated.Value(0)).current;
  const cell = size / 16;

  useEffect(() => {
    if (!motion) {
      bob.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: -4, duration: 1050, useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1050, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [bob, motion]);

  return (
    <View
      accessibilityLabel={label}
      accessible
      accessibilityRole="image"
      style={[styles.frame, { width: size, height: size }]}
    >
      <View style={styles.orbit} />
      <View style={styles.innerOrbit} />
      <View style={[styles.spark, styles.redSpark]} />
      <View style={[styles.spark, styles.greenSpark]} />
      <View style={[styles.spark, styles.blueSpark]} />
      <Animated.View
        style={[
          styles.sprite,
          { width: size, height: size, transform: [{ translateY: bob }] },
        ]}
      >
        {sprite.flatMap((row, y) =>
          row.padEnd(16, ' ').split('').flatMap((pixel, x) => {
            if (pixel === ' ') return [];
            return (
              <View
                key={`${x}-${y}`}
                style={{
                  position: 'absolute',
                  left: x * cell,
                  top: y * cell,
                  width: cell,
                  height: cell,
                  backgroundColor: pixelColors[pixel] ?? colors.primary,
                }}
              />
            );
          }),
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center' },
  orbit: {
    position: 'absolute',
    width: '94%',
    height: '94%',
    borderRadius: 999,
    backgroundColor: '#0e0b18',
    borderWidth: 2,
    borderColor: '#211b36',
  },
  innerOrbit: {
    position: 'absolute',
    width: '78%',
    height: '78%',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#33294e',
  },
  sprite: { position: 'absolute' },
  spark: { position: 'absolute', width: 7, height: 7, zIndex: 2 },
  redSpark: { top: '21%', left: '19%', backgroundColor: '#ff526a' },
  greenSpark: { top: '35%', right: '13%', backgroundColor: '#72e5a6' },
  blueSpark: { bottom: '19%', right: '22%', backgroundColor: '#5a9cff' },
});
