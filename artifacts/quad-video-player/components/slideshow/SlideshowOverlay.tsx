import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSlideshow } from '@/hooks/useSlideshow';
import { useColors } from '@/hooks/useColors';
import { bounceKeyframes, slideshowBounds } from '@/lib/slideshow';

export default function SlideshowOverlay({ active }: { active: boolean }) {
  const { slideshow: s, setSlideshow } = useSlideshow();
  const colors = useColors();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const position = useRef(new Animated.ValueXY()).current;
  const bounds = slideshowBounds(size.width, size.height, s);
  const image = s.pool[s.index % Math.max(1, s.pool.length)];
  useEffect(() => { setFailedUri(null); }, [image?.uri, s.enabled]);
  useEffect(() => {
    if (!active || !s.enabled || s.pool.length < 2) return;
    const timer = setInterval(() => {
      setSlideshow((current) => ({ ...current, index: (current.index + 1) % Math.max(1, current.pool.length) }));
    }, s.seconds * 1000);
    return () => clearInterval(timer);
  }, [active, s.enabled, s.pool.length, s.seconds, setSlideshow]);
  useEffect(() => {
    position.stopAnimation();
    position.setValue({ x: 0, y: 0 });
    if (!active || !s.enabled || !s.bounce || !image) return;
    const animateAxis = (value: Animated.Value, start: number, max: number, speed: number) => {
      if (max <= 0) return null;
      return Animated.loop(Animated.timing(value, {
        toValue: 1, duration: 2 * max / Math.max(1, speed) * 1000,
        easing: Easing.linear, useNativeDriver: true, isInteraction: false,
      }));
    };
    const animations = [
      animateAxis(position.x, bounds.x, bounds.maxX, s.speed),
      animateAxis(position.y, bounds.y, bounds.maxY, s.speed * 0.73),
    ].filter((animation): animation is Animated.CompositeAnimation => animation !== null);
    animations.forEach((animation) => animation.start());
    return () => { animations.forEach((animation) => animation.stop()); position.stopAnimation(); };
  }, [active, s.enabled, s.bounce, s.speed, s.x, s.y, s.scale, size.width, size.height, !!image, position]);

  return (
    <View pointerEvents="none" style={styles.overlay}
      onLayout={(event) => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
      {active && s.enabled && image && size.width > 0 && (
        <Animated.View style={{
          width: bounds.width, height: bounds.height, opacity: s.opacity,
          transform: [
            { translateX: s.bounce ? position.x.interpolate(bounceKeyframes(bounds.x, bounds.maxX)) : bounds.x },
            { translateY: s.bounce ? position.y.interpolate(bounceKeyframes(bounds.y, bounds.maxY)) : bounds.y },
          ],
        }}>
          {failedUri === image.uri ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Image unavailable · {image.name}</Text>
          ) : (
            <Image source={{ uri: image.uri }} style={StyleSheet.absoluteFill}
              contentFit="contain" autoplay allowDownscaling cachePolicy="none"
              recyclingKey={image.uri} transition={0}
              accessibilityLabel={`Slideshow: ${image.name}`}
              onError={() => setFailedUri(image.uri)} />
          )}
        </Animated.View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({ overlay: { ...StyleSheet.absoluteFill, zIndex: 5 } });
