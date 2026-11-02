import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { isBorderUnlocked, levelForExperience, type BorderDirection, type BorderStyleId } from '@/lib/player-rewards';

const TILE_SIZE = 160;
const BORDER_SIZE = 22;
const SOLID_BORDER_SIZE = 5;
const PUZZLED_TILE = require('../assets/puzzled-border-tile.jpg');

export default function ScreenBorder({
  enabled,
  styleId,
  scroll,
  direction,
  speed,
  xp,
  allRewardsUnlocked,
  textureScale,
}: {
  enabled: boolean;
  styleId: BorderStyleId;
  scroll: boolean;
  direction: BorderDirection;
  speed: number;
  xp: number;
  allRewardsUnlocked: boolean;
  textureScale: number;
}) {
  const colors = useColors();
  const progress = useRef(new Animated.Value(0)).current;
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const activeStyle = isBorderUnlocked(styleId, xp, allRewardsUnlocked) ? styleId : 'gamecubed';
  const isScrolling = enabled && activeStyle === 'puzzled' && scroll &&
    (allRewardsUnlocked || levelForExperience(xp) >= 4);
  const scale = Math.max(0.5, Math.min(2.5, textureScale));
  const travel = TILE_SIZE * scale;

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
  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setViewport((current) => current.width === width && current.height === height ? current : { width, height });
  };
  if (!viewport.width || !viewport.height) {
    return <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={handleLayout} />;
  }

  if (activeStyle === 'puzzled') {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, direction === 'left' || direction === 'right'
        ? (direction === 'left' ? -travel : travel) : 0],
    });
    const translateY = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, direction === 'up' || direction === 'down'
        ? (direction === 'up' ? -travel : travel) : 0],
    });
    const frameWidth = viewport.width / 2;
    const frameHeight = viewport.height / 2;
    const renderTexturedEdge = (
      frame: { id: string; row: number; column: number },
      side: 'top' | 'bottom' | 'left' | 'right',
    ) => {
      const innerEdge = (side === 'top' && frame.row === 1) || (side === 'bottom' && frame.row === 0) ||
        (side === 'left' && frame.column === 1) || (side === 'right' && frame.column === 0);
      const thickness = innerEdge ? BORDER_SIZE / 2 : BORDER_SIZE;
      const edgePosition = side === 'top'
        ? { top: 0, left: 0, width: frameWidth, height: thickness }
        : side === 'bottom'
          ? { top: frameHeight - thickness, left: 0, width: frameWidth, height: thickness }
          : side === 'left'
            ? { top: 0, left: 0, width: thickness, height: frameHeight }
            : { top: 0, left: frameWidth - thickness, width: thickness, height: frameHeight };
      const rawWidth = (edgePosition.width + 2 * travel) / scale;
      const rawHeight = (edgePosition.height + 2 * travel) / scale;
      return (
        <View key={`${frame.id}-${side}`} style={[styles.edge, edgePosition]}>
          <Animated.View style={[styles.textureWindow, {
            left: frameWidth / 2 - edgePosition.left - rawWidth / 2,
            top: frameHeight / 2 - edgePosition.top - rawHeight / 2,
            width: rawWidth,
            height: rawHeight,
            transform: [{ translateX }, { translateY }],
          }]}>
            <Animated.Image source={PUZZLED_TILE} resizeMode="repeat"
              style={[styles.textureImage, { width: rawWidth, height: rawHeight, transform: [{ scale }] }]} />
          </Animated.View>
        </View>
      );
    };
    const frames = [
      { id: 'top-left', row: 0, column: 0, left: 0, top: 0 },
      { id: 'top-right', row: 0, column: 1, left: frameWidth, top: 0 },
      { id: 'bottom-left', row: 1, column: 0, left: 0, top: frameHeight },
      { id: 'bottom-right', row: 1, column: 1, left: frameWidth, top: frameHeight },
    ];
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={handleLayout}>
        {frames.map((frame) => (
          <View key={frame.id} style={[styles.frame, { left: frame.left, top: frame.top, width: frameWidth, height: frameHeight }]}>
            {renderTexturedEdge(frame, 'top')}
            {renderTexturedEdge(frame, 'bottom')}
            {renderTexturedEdge(frame, 'left')}
            {renderTexturedEdge(frame, 'right')}
          </View>
        ))}
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
  const frameWidth = viewport.width / 2;
  const frameHeight = viewport.height / 2;
  const frames = [
    { id: 'top-left', row: 0, column: 0, left: 0, top: 0 },
    { id: 'top-right', row: 0, column: 1, left: frameWidth, top: 0 },
    { id: 'bottom-left', row: 1, column: 0, left: 0, top: frameHeight },
    { id: 'bottom-right', row: 1, column: 1, left: frameWidth, top: frameHeight },
  ];
  const edge = (frame: (typeof frames)[number], side: 'top' | 'bottom' | 'left' | 'right') => {
    const innerEdge = (side === 'top' && frame.row === 1) || (side === 'bottom' && frame.row === 0) ||
      (side === 'left' && frame.column === 1) || (side === 'right' && frame.column === 0);
    const thickness = innerEdge ? SOLID_BORDER_SIZE / 2 : SOLID_BORDER_SIZE;
    const edgeStyle = side === 'top'
      ? { top: 0, left: 0, right: 0, height: thickness }
      : side === 'bottom'
        ? { bottom: 0, left: 0, right: 0, height: thickness }
        : side === 'left'
          ? { top: 0, bottom: 0, left: 0, width: thickness }
          : { top: 0, bottom: 0, right: 0, width: thickness };
    return <View key={side} style={[styles.solidEdge, edgeStyle, { backgroundColor: edgeColors[side] }]} />;
  };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={handleLayout}>
      {frames.map((frame) => (
        <View key={frame.id} style={[styles.frame, { left: frame.left, top: frame.top, width: frameWidth, height: frameHeight }]}>
          {edge(frame, 'top')}
          {edge(frame, 'bottom')}
          {edge(frame, 'left')}
          {edge(frame, 'right')}
          {activeStyle === 'nebula' && (
            <View style={[styles.nebulaInset, { borderColor: colors.accentForeground }]} />
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { position: 'absolute', overflow: 'hidden' },
  edge: { position: 'absolute', overflow: 'hidden' },
  textureWindow: { position: 'absolute' },
  textureImage: { position: 'absolute', left: 0, top: 0 },
  solidEdge: { position: 'absolute' },
  nebulaInset: { position: 'absolute', top: 9, bottom: 9, left: 9, right: 9, borderWidth: 1 },
});
