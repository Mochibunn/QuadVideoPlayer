import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import {
  borderStrips, frameRects, scrollLoop, tileGridForStrip, type BorderLayout, type BorderStrip,
} from '@/lib/border-geometry';
import {
  ANIMATED_BORDER_LEVEL, borderDirectionVector, clampTextureScale, isBorderUnlocked, isTexturedBorder,
  levelForExperience, type BorderDirection, type BorderStyleId,
} from '@/lib/player-rewards';

const PUZZLE_TILE_SIZE = 160;
const PAW_TILE_SIZE = 56;
const BORDER_SIZE = 22;
const SOLID_BORDER_SIZE = 5;
const PUZZLED_TILE = require('../assets/puzzled-border-tile.jpg');

function TexturedStrip({
  strip, tile, styleId, translateX, translateY, pawColor, pawAlt, base,
}: {
  strip: BorderStrip;
  tile: number;
  styleId: BorderStyleId;
  translateX: Animated.AnimatedInterpolation<number> | number;
  translateY: Animated.AnimatedInterpolation<number> | number;
  pawColor: string;
  pawAlt: string;
  base: string;
}) {
  const grid = tileGridForStrip(strip, tile);
  const cells: React.ReactNode[] = [];
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const left = grid.originX + column * tile;
      const top = grid.originY + row * tile;
      if (styleId === 'puzzled') {
        cells.push(<Image key={`${row}-${column}`} source={PUZZLED_TILE} resizeMode="stretch"
          style={{ position: 'absolute', left, top, width: tile, height: tile }} />);
      } else {
        // Two staggered paws per tile keep the trail continuous along both axes.
        const icon = Math.max(9, Math.min(16, BORDER_SIZE * 0.62));
        const odd = (Math.round((strip.x + left) / tile) + Math.round((strip.y + top) / tile)) % 2 === 0;
        cells.push(
          <MaterialCommunityIcons key={`${row}-${column}-a`} name="paw" size={icon} color={odd ? pawColor : pawAlt}
            style={{ position: 'absolute', left: left + tile * 0.12, top: top + tile * 0.1, transform: [{ rotate: '-18deg' }] }} />,
          <MaterialCommunityIcons key={`${row}-${column}-b`} name="paw" size={icon} color={odd ? pawAlt : pawColor}
            style={{ position: 'absolute', left: left + tile * 0.6, top: top + tile * 0.55, transform: [{ rotate: '16deg' }] }} />,
        );
      }
    }
  }
  return (
    <View style={[styles.strip, { left: strip.x, top: strip.y, width: strip.width, height: strip.height, backgroundColor: base }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }, { translateY }] }]}>
        {cells}
      </Animated.View>
    </View>
  );
}

export default function ScreenBorder({
  enabled, styleId, scroll, direction, speed, xp, allRewardsUnlocked, textureScale, layout = 'quad',
}: {
  enabled: boolean;
  styleId: BorderStyleId;
  scroll: boolean;
  direction: BorderDirection;
  speed: number;
  xp: number;
  allRewardsUnlocked: boolean;
  textureScale: number;
  /** 'single' draws one frame around the fullscreen stream; 'quad' draws four. */
  layout?: BorderLayout;
}) {
  const colors = useColors();
  const progress = useRef(new Animated.Value(0)).current;
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const activeStyle = isBorderUnlocked(styleId, xp, allRewardsUnlocked) ? styleId : 'gamecubed';
  const textured = isTexturedBorder(activeStyle);
  const isScrolling = enabled && textured && scroll &&
    (allRewardsUnlocked || levelForExperience(xp) >= ANIMATED_BORDER_LEVEL);
  const scale = clampTextureScale(textureScale);
  const tile = (activeStyle === 'pawprint' ? PAW_TILE_SIZE : PUZZLE_TILE_SIZE) * scale;
  const loop = useMemo(() => scrollLoop(borderDirectionVector(direction), tile, speed), [direction, tile, speed]);

  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(0);
    if (!isScrolling || !loop.durationMs) return;
    const animation = Animated.loop(Animated.timing(progress, {
      toValue: 1, duration: loop.durationMs, easing: Easing.linear, useNativeDriver: true, isInteraction: false,
    }));
    animation.start();
    return () => animation.stop();
  }, [isScrolling, loop.durationMs, progress]);

  if (!enabled) return null;
  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setViewport((current) => current.width === width && current.height === height ? current : { width, height });
  };
  if (!viewport.width || !viewport.height) {
    return <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={handleLayout} />;
  }

  if (textured) {
    const strips = borderStrips(viewport.width, viewport.height, BORDER_SIZE, layout);
    const translateX = isScrolling ? progress.interpolate({ inputRange: [0, 1], outputRange: [0, loop.dx] }) : 0;
    const translateY = isScrolling ? progress.interpolate({ inputRange: [0, 1], outputRange: [0, loop.dy] }) : 0;
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={handleLayout}>
        {strips.map((strip) => (
          <TexturedStrip key={strip.id} strip={strip} tile={tile} styleId={activeStyle}
            translateX={translateX} translateY={translateY}
            pawColor={colors.primary} pawAlt={colors.accentForeground} base={activeStyle === 'pawprint' ? colors.accent : colors.background} />
        ))}
      </View>
    );
  }

  const edgeColors = activeStyle === 'prism'
    ? { top: '#6b5cb1', right: '#f6392c', bottom: '#ffd248', left: '#109b61' }
    : activeStyle === 'aurora'
      ? { top: '#76b8b2', right: '#9198d8', bottom: '#d695b3', left: '#80aa91' }
      : (() => {
        const c = activeStyle === 'gamecubed' ? colors.primary : colors.accentForeground;
        return { top: c, right: c, bottom: c, left: c };
      })();
  const strips = borderStrips(viewport.width, viewport.height, SOLID_BORDER_SIZE, layout);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={handleLayout}>
      {strips.map((strip) => {
        if (!strip.center) {
          const side = strip.id as 'top' | 'bottom' | 'left' | 'right';
          return <View key={strip.id} style={[styles.strip, { left: strip.x, top: strip.y, width: strip.width, height: strip.height, backgroundColor: edgeColors[side] }]} />;
        }
        // Centre line = two half-thickness bands (one per neighbouring frame), total equal to an outer edge.
        const half = strip.axis === 'vertical' ? strip.width / 2 : strip.height / 2;
        const first = strip.axis === 'vertical' ? edgeColors.right : edgeColors.bottom;
        const second = strip.axis === 'vertical' ? edgeColors.left : edgeColors.top;
        return (
          <View key={strip.id} style={[styles.strip, { left: strip.x, top: strip.y, width: strip.width, height: strip.height, flexDirection: strip.axis === 'vertical' ? 'row' : 'column' }]}>
            <View style={strip.axis === 'vertical' ? { width: half, backgroundColor: first } : { height: half, backgroundColor: first }} />
            <View style={{ flex: 1, backgroundColor: second }} />
          </View>
        );
      })}
      {activeStyle === 'nebula' && frameRects(viewport.width, viewport.height, layout).map((rect, index) => (
        <View key={`nebula-${index}`} style={[styles.nebulaInset, {
          left: rect.x + 9, top: rect.y + 9, width: rect.width - 18, height: rect.height - 18, borderColor: colors.accentForeground,
        }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { position: 'absolute', overflow: 'hidden' },
  nebulaInset: { position: 'absolute', borderWidth: 1 },
});
