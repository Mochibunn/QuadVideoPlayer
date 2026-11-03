import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import {
  borderStrips, frameRects, scrollLoop, tileGridForStrip, type BorderLayout, type BorderStrip,
} from '@/lib/border-geometry';
import {
  ANIMATED_BORDER_LEVEL, borderDirectionVector, clampTextureScale, effectiveBorderThickness, isBorderUnlocked,
  isTexturedBorder, levelForExperience, TRANS_FLAG_COLORS, type BorderDirection, type BorderStyleId,
} from '@/lib/player-rewards';

const PUZZLE_TILE_SIZE = 160;
const PAW_TILE_SIZE = 56;
const STRIPE_TILE_SIZE = 60;
const ICON_PUZZLE_TILE_SIZE = 48;
const PUZZLED_TILE = require('../assets/puzzled-border-tile.jpg');
const TRANS_BLUE = TRANS_FLAG_COLORS[0];
const TRANS_PINK = TRANS_FLAG_COLORS[1];
const TRANS_WHITE = TRANS_FLAG_COLORS[2];

function baseTileFor(style: BorderStyleId): number {
  if (style === 'puzzled') return PUZZLE_TILE_SIZE;
  if (style === 'trans-flag') return STRIPE_TILE_SIZE;
  if (style === 'trans-puzzle') return ICON_PUZZLE_TILE_SIZE;
  return PAW_TILE_SIZE;
}

function TexturedStrip({
  strip, tile, styleId, thickness, translateX, translateY, pawColor, pawAlt, base, pawSpacing,
}: {
  strip: BorderStrip;
  tile: number;
  styleId: BorderStyleId;
  thickness: number;
  translateX: Animated.AnimatedInterpolation<number> | number;
  translateY: Animated.AnimatedInterpolation<number> | number;
  pawColor: string;
  pawAlt: string;
  base: string;
  pawSpacing: number;
}) {
  const grid = tileGridForStrip(strip, tile);
  const cells: React.ReactNode[] = [];
  if (styleId === 'trans-flag') {
    // Bands run across the strip and repeat every tile along it, so scrolling reads as marching stripes.
    const band = tile / TRANS_FLAG_COLORS.length;
    if (strip.axis === 'horizontal') {
      const h = grid.rows * tile;
      for (let column = 0; column < grid.columns; column += 1) {
        const left = grid.originX + column * tile;
        TRANS_FLAG_COLORS.forEach((color, i) => cells.push(
          <View key={`${column}-${i}`} style={{ position: 'absolute', left: left + i * band, top: grid.originY, width: band + 0.5, height: h, backgroundColor: color }} />,
        ));
      }
    } else {
      const w = grid.columns * tile;
      for (let row = 0; row < grid.rows; row += 1) {
        const top = grid.originY + row * tile;
        TRANS_FLAG_COLORS.forEach((color, i) => cells.push(
          <View key={`${row}-${i}`} style={{ position: 'absolute', top: top + i * band, left: grid.originX, height: band + 0.5, width: w, backgroundColor: color }} />,
        ));
      }
    }
  } else {
    for (let row = 0; row < grid.rows; row += 1) {
      for (let column = 0; column < grid.columns; column += 1) {
        const left = grid.originX + column * tile;
        const top = grid.originY + row * tile;
        const odd = (Math.round((strip.x + left) / tile) + Math.round((strip.y + top) / tile)) % 2 === 0;
        if (styleId === 'puzzled') {
          cells.push(<Image key={`${row}-${column}`} source={PUZZLED_TILE} resizeMode="stretch"
            style={{ position: 'absolute', left, top, width: tile, height: tile }} />);
        } else if (styleId === 'trans-puzzle') {
          const size = Math.max(8, Math.min(tile * 0.78, thickness * 0.9));
          const cycle = [TRANS_BLUE, TRANS_PINK, TRANS_WHITE];
          const index = Math.abs(Math.round((strip.x + left) / tile) + 2 * Math.round((strip.y + top) / tile)) % 3;
          cells.push(
            <MaterialCommunityIcons key={`${row}-${column}`} name="puzzle" size={size} color={cycle[index]}
              style={{ position: 'absolute', left: left + (tile - size) / 2, top: top + (tile - size) / 2,
                transform: [{ rotate: odd ? '90deg' : '0deg' }] }} />,
          );
        } else {
          // Two staggered paws per tile keep the trail continuous along both axes.
          const icon = Math.max(8, Math.min(tile * 0.42 / pawSpacing, thickness * 0.66));
          cells.push(
            <MaterialCommunityIcons key={`${row}-${column}-a`} name="paw" size={icon} color={odd ? pawColor : pawAlt}
              style={{ position: 'absolute', left: left + tile * 0.12, top: top + tile * 0.1, transform: [{ rotate: '-18deg' }] }} />,
            <MaterialCommunityIcons key={`${row}-${column}-b`} name="paw" size={icon} color={odd ? pawAlt : pawColor}
              style={{ position: 'absolute', left: left + tile * 0.6, top: top + tile * 0.55, transform: [{ rotate: '16deg' }] }} />,
          );
        }
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

/**
 * Decorative frame. Layering contract: render as an absolute-fill sibling AFTER the
 * video surfaces and BEFORE every control/overlay in the same parent. It never
 * receives touches (pointerEvents none) and never clips other UI.
 */
export default function ScreenBorder({
  enabled, styleId, scroll, direction, speed, xp, allRewardsUnlocked, textureScale, pawSpacing = 1, layout = 'quad', thickness,
}: {
  enabled: boolean;
  styleId: BorderStyleId;
  scroll: boolean;
  direction: BorderDirection;
  speed: number;
  xp: number;
  allRewardsUnlocked: boolean;
  textureScale: number;
  pawSpacing?: number;
  /** 'single' draws one frame around the fullscreen stream; 'quad' draws four. */
  layout?: BorderLayout;
  /** Border thickness in px (4–64). Omitted/null uses the style default. */
  thickness?: number | null;
}) {
  const colors = useColors();
  const progress = useRef(new Animated.Value(0)).current;
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const activeStyle = isBorderUnlocked(styleId, xp, allRewardsUnlocked) ? styleId : 'gamecubed';
  const textured = isTexturedBorder(activeStyle);
  const isScrolling = enabled && textured && scroll &&
    (allRewardsUnlocked || levelForExperience(xp) >= ANIMATED_BORDER_LEVEL);
  const scale = clampTextureScale(textureScale);
  const size = effectiveBorderThickness(activeStyle, thickness);
  const pawStyle = activeStyle === 'pawprint' || activeStyle === 'trans-paw';
  const safePawSpacing = Math.max(0.5, Math.min(3, pawSpacing));
  const tile = baseTileFor(activeStyle) * scale * (pawStyle ? safePawSpacing : 1);
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
    return <View pointerEvents="none" style={styles.layer} onLayout={handleLayout} />;
  }

  if (textured) {
    const strips = borderStrips(viewport.width, viewport.height, size, layout);
    const translateX = isScrolling ? progress.interpolate({ inputRange: [0, 1], outputRange: [0, loop.dx] }) : 0;
    const translateY = isScrolling ? progress.interpolate({ inputRange: [0, 1], outputRange: [0, loop.dy] }) : 0;
    const trans = activeStyle === 'trans-paw' || activeStyle === 'trans-puzzle' || activeStyle === 'trans-flag';
    return (
      <View pointerEvents="none" style={styles.layer} onLayout={handleLayout}>
        {strips.map((strip) => (
          <TexturedStrip key={strip.id} strip={strip} tile={tile} styleId={activeStyle} thickness={size}
            translateX={translateX} translateY={translateY}
            pawColor={trans ? TRANS_BLUE : colors.primary} pawAlt={trans ? TRANS_PINK : colors.accentForeground}
            base={trans ? '#0b0a10' : activeStyle === 'pawprint' ? colors.accent : colors.background}
            pawSpacing={safePawSpacing} />
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
  const strips = borderStrips(viewport.width, viewport.height, size, layout);
  const inset = size + 4;
  return (
    <View pointerEvents="none" style={styles.layer} onLayout={handleLayout}>
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
      {activeStyle === 'nebula' && frameRects(viewport.width, viewport.height, layout).map((rect, index) => {
        const w = rect.width - inset * 2;
        const h = rect.height - inset * 2;
        if (w <= 0 || h <= 0) return null;
        return (
          <View key={`nebula-${index}`} style={[styles.nebulaInset, {
            left: rect.x + inset, top: rect.y + inset, width: w, height: h, borderColor: colors.accentForeground,
          }]} />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 0 },
  strip: { position: 'absolute', overflow: 'hidden' },
  nebulaInset: { position: 'absolute', borderWidth: 1 },
});
