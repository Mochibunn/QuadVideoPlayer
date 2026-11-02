import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { isBorderUnlocked, levelForExperience, type BorderDirection, type BorderStyleId } from '@/lib/player-rewards';

const TILE_SIZE = 160;
const BORDER_SIZE = 22;
const PUZZLED_TILE = require('../assets/puzzled-border-tile.jpg');

export default function ScreenBorder({
  enabled,
  styleId,
  scroll,
  direction,
  speed,
  xp,
  allRewardsUnlocked,
}: {
  enabled: boolean;
  styleId: BorderStyleId;
  scroll: boolean;
  direction: BorderDirection;
  speed: number;
  xp: number;
  allRewardsUnlocked: boolean;
}) {
  const colors = useColors();
  const { width, height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const activeStyle = isBorderUnlocked(styleId, xp, allRewardsUnlocked) ? styleId : 'gamecubed';
  const isScrolling = enabled && activeStyle === 'puzzled' && scroll &&
    (allRewardsUnlocked || levelForExperience(xp) >= 4);

  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(0);
    if (!isScrolling) return;
    const animation = Animated.loop(Animated.timing(progress, {
      toValue: 1,
      duration: Math.max(1500, Math.round(60_000 / Math.max(1, Math.min(10, speed)))),
      easing: Easing.linear,
      useNativeDriver: true,
      isInteraction: false,
    }));
    animation.start();
    return () => animation.stop();
  }, [direction, isScrolling, progress, speed]);

  if (!enabled) return null;

  if (activeStyle === 'puzzled') {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, direction === 'left' || direction === 'right'
        ? (direction === 'left' ? -TILE_SIZE : TILE_SIZE) : 0],
    });
    const translateY = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, direction === 'up' || direction === 'down'
        ? (direction === 'up' ? -TILE_SIZE : TILE_SIZE) : 0],
    });
    const imageStyle = {
      position: 'absolute' as const,
      left: -TILE_SIZE,
      top: -TILE_SIZE,
      width: width + TILE_SIZE * 2,
      height: height + TILE_SIZE * 2,
      transform: [{ translateX }, { translateY }],
    };
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.edge, styles.top, { height: BORDER_SIZE }]}>
          <Animated.Image source={PUZZLED_TILE} resizeMode="repeat" style={imageStyle} />
        </View>
        <View style={[styles.edge, styles.bottom, { height: BORDER_SIZE }]}>
          <Animated.Image source={PUZZLED_TILE} resizeMode="repeat" style={imageStyle} />
        </View>
        <View style={[styles.edge, styles.left, { width: BORDER_SIZE }]}>
          <Animated.Image source={PUZZLED_TILE} resizeMode="repeat" style={imageStyle} />
        </View>
        <View style={[styles.edge, styles.right, { width: BORDER_SIZE }]}>
          <Animated.Image source={PUZZLED_TILE} resizeMode="repeat" style={imageStyle} />
        </View>
      </View>
    );
  }

  const edgeColors = activeStyle === 'prism'
    ? { top: '#6b5cb1', right: '#f6392c', bottom: '#ffd248', left: '#109b61' }
    : activeStyle === 'aurora'
      ? { top: '#76b8b2', right: '#9198d8', bottom: '#d695b3', left: '#80aa91' }
      : {
        top: activeStyle === 'gamecubed' ? colors.primary : colors.accentForeground,
        right: activeStyle === 'gamecubed' ? colors.primary : colors.accentForeground,
        bottom: activeStyle === 'gamecubed' ? colors.primary : colors.accentForeground,
        left: activeStyle === 'gamecubed' ? colors.primary : colors.accentForeground,
      };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.solidEdge, styles.top, { height: 5, backgroundColor: edgeColors.top }]} />
      <View style={[styles.solidEdge, styles.bottom, { height: 5, backgroundColor: edgeColors.bottom }]} />
      <View style={[styles.solidEdge, styles.left, { width: 5, backgroundColor: edgeColors.left }]} />
      <View style={[styles.solidEdge, styles.right, { width: 5, backgroundColor: edgeColors.right }]} />
      {activeStyle === 'nebula' && (
        <View style={[styles.nebulaInset, { borderColor: colors.accentForeground }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  edge: { position: 'absolute', overflow: 'hidden' },
  solidEdge: { position: 'absolute' },
  nebulaInset: { position: 'absolute', top: 9, bottom: 9, left: 9, right: 9, borderWidth: 1 },
  top: { top: 0, left: 0, right: 0 },
  bottom: { bottom: 0, left: 0, right: 0 },
  left: { top: 0, bottom: 0, left: 0 },
  right: { top: 0, bottom: 0, right: 0 },
});
