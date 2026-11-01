import { Image } from 'expo-image';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSlideshow, type SlideshowRuntime } from '@/hooks/useSlideshow';
import { useColors } from '@/hooks/useColors';
import { bounceKeyframes, slideshowBounds, type SlideshowImage, type SlideshowInstance } from '@/lib/slideshow';

export default function SlideshowOverlay({ active }: { active: boolean }) {
  const { slideshow: s, runtime, revision } = useSlideshow();
  const [size, setSize] = useState({ width: 0, height: 0 });
  return (
    <View pointerEvents="none" style={styles.overlay}
      onLayout={(event) => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
      {active && s.enabled && size.width > 0 && s.instances.filter((item) => item.enabled).map((instance) => (
        <SlideshowLayer key={`${revision}:${instance.id}`} instance={instance} pool={s.pool}
          width={size.width} height={size.height} runtime={runtime} />
      ))}
    </View>
  );
}

const SlideshowLayer = memo(function SlideshowLayer({ instance: s, pool, width, height, runtime }: {
  instance: SlideshowInstance; pool: SlideshowImage[]; width: number; height: number;
  runtime: React.RefObject<Map<string, SlideshowRuntime>>;
}) {
  const colors = useColors();
  const [index, setIndex] = useState(() => (runtime.current.get(s.id)?.index ?? s.index) % Math.max(1, pool.length));
  const indexRef = useRef(index);
  const previousInput = useRef({ pool, index: s.index });
  const advance = useCallback(() => {
    const next = (indexRef.current + 1) % Math.max(1, pool.length);
    indexRef.current = next;
    const entry = runtime.current.get(s.id);
    if (entry) entry.index = next;
    setIndex(next);
  }, [pool.length, runtime, s.id]);
  useEffect(() => {
    if (previousInput.current.pool === pool && previousInput.current.index === s.index) return;
    previousInput.current = { pool, index: s.index };
    const next = s.index % Math.max(1, pool.length);
    indexRef.current = next;
    setIndex(next);
    const entry = runtime.current.get(s.id);
    if (entry) entry.index = next;
  }, [pool, s.index, runtime, s.id]);
  useEffect(() => {
    const entry: SlideshowRuntime = { index: indexRef.current, next: advance };
    runtime.current.set(s.id, entry);
    return () => {
      if (runtime.current.get(s.id) === entry) {
        entry.next = undefined;
      }
    };
  }, [advance, runtime, s.id]);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const position = useRef(new Animated.ValueXY()).current;
  const bounds = slideshowBounds(width, height, s);
  const image = pool[index % Math.max(1, pool.length)];
  useEffect(() => { setFailedUri(null); }, [image?.uri, s.enabled]);
  useEffect(() => {
    if (pool.length < 2) return;
    const timer = setInterval(advance, s.seconds * 1000);
    return () => clearInterval(timer);
  }, [pool.length, s.seconds, advance]);
  useEffect(() => {
    position.stopAnimation();
    position.setValue({ x: 0, y: 0 });
    if (!s.bounce || !image) return;
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
  }, [s.bounce, s.speed, s.x, s.y, s.scale, width, height, !!image, position]);

  return (
    <>
      {image && (
        <Animated.View style={{
          position: 'absolute', width: bounds.width, height: bounds.height, opacity: s.opacity,
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
    </>
  );
});
const styles = StyleSheet.create({ overlay: { ...StyleSheet.absoluteFill, zIndex: 5 } });
