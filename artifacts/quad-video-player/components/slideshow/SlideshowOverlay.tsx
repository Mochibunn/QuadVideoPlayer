import { Image } from 'expo-image';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSlideshow, type SlideshowRuntime } from '@/hooks/useSlideshow';
import { useColors } from '@/hooks/useColors';
import { useOnlineSources } from '@/hooks/useOnlineSources';
import { bounceKeyframes, nextSlideshowIndex, shouldPrefetchSlideshowPage, slideshowBounds, type SlideshowImage, type SlideshowInstance } from '@/lib/slideshow';

const ONLINE_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export default function SlideshowOverlay({ active }: { active: boolean }) {
  const { slideshow: s, runtime, revision } = useSlideshow();
  const online = useOnlineSources();
  const colors = useColors();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const activeSourceKey = active && s.enabled
    ? [...new Set(s.instances.filter((item) => item.enabled && item.sourceId).map((item) => item.sourceId!))].join('\u0000')
    : '';
  useEffect(() => {
    if (!activeSourceKey) return;
    const sourceIds = activeSourceKey.split('\u0000');
    sourceIds.forEach(online.ensureLoaded);
    const timer = setInterval(() => {
      sourceIds.forEach((id) => void online.refresh(id, false, true));
    }, ONLINE_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [activeSourceKey, online.ensureLoaded, online.refresh]);
  return (
    <View pointerEvents="none" style={styles.overlay}
      onLayout={(event) => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
      {active && s.enabled && size.width > 0 && s.instances.filter((item) => item.enabled).map((instance) => (
        instance.sourceId ? (
          <React.Fragment key={`${revision}:${instance.id}:${instance.sourceId}`}>
            {online.results[instance.sourceId]?.images.length ? (
              <SlideshowLayer instance={instance} pool={online.results[instance.sourceId].images}
                width={size.width} height={size.height} runtime={runtime} />
            ) : (
              <View style={{ position: 'absolute', left: 12, top: 12 + s.instances.indexOf(instance) * 26 }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                  {online.sources.find((source) => source.id === instance.sourceId)?.name ?? 'Missing online source'}:
                  {' '}{online.results[instance.sourceId]?.error || (online.results[instance.sourceId]?.loading ? 'Loading images…' :
                    'No images loaded. Open Online media sources to load or change this search.')}
                </Text>
              </View>
            )}
          </React.Fragment>
        ) : <SlideshowLayer key={`${revision}:${instance.id}:local`} instance={instance} pool={s.pool}
          width={size.width} height={size.height} runtime={runtime} />
      ))}
    </View>
  );
}

const SlideshowLayer = memo(function SlideshowLayer({ instance: s, pool, width, height, runtime }: {
  instance: SlideshowInstance; pool: SlideshowImage[]; width: number; height: number;
  runtime: React.RefObject<Map<string, SlideshowRuntime>>;
}) {
  const online = useOnlineSources();
  const sourceResult = s.sourceId ? online.results[s.sourceId] : undefined;
  const [index, setIndex] = useState(() => (runtime.current.get(s.id)?.index ?? s.index) % Math.max(1, pool.length));
  const indexRef = useRef(index);
  const lastPrefetchStep = useRef<number | null>(null);
  const previousInput = useRef({ pool, index: s.index });
  const advance = useCallback(() => {
    const next = nextSlideshowIndex(pool.length, indexRef.current, s.shuffle);
    indexRef.current = next;
    const entry = runtime.current.get(s.id);
    if (entry) { entry.index = next; entry.steps = (entry.steps ?? 0) + 1; }
    setIndex(next);
  }, [pool.length, runtime, s.id, s.shuffle]);
  useEffect(() => {
    if (previousInput.current.pool === pool && previousInput.current.index === s.index) return;
    const previousImage = previousInput.current.pool[indexRef.current]?.uri;
    const explicitIndexChange = previousInput.current.index !== s.index;
    const preserved = pool.findIndex((item) => item.uri === previousImage);
    const next = explicitIndexChange ? s.index % Math.max(1, pool.length) :
      preserved >= 0 ? preserved : indexRef.current % Math.max(1, pool.length);
    previousInput.current = { pool, index: s.index };
    indexRef.current = next;
    setIndex(next);
    const entry = runtime.current.get(s.id);
    if (entry) entry.index = next;
  }, [pool, s.index, runtime, s.id]);
  useEffect(() => {
    const entry: SlideshowRuntime = {
      index: indexRef.current, steps: runtime.current.get(s.id)?.steps ?? 0, next: advance,
    };
    runtime.current.set(s.id, entry);
    return () => {
      if (runtime.current.get(s.id) === entry) {
        entry.next = undefined;
      }
    };
  }, [advance, runtime, s.id]);
  const steps = runtime.current.get(s.id)?.steps ?? 0;
  useEffect(() => {
    if (!s.sourceId || !shouldPrefetchSlideshowPage(
      index, steps, pool.length, sourceResult?.hasMore === true,
      sourceResult?.loading === true, lastPrefetchStep.current,
    )) return;
    lastPrefetchStep.current = steps;
    void online.refresh(s.sourceId, true);
  }, [index, steps, pool.length, s.sourceId, sourceResult?.hasMore, sourceResult?.loading, online.refresh]);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const position = useRef(new Animated.ValueXY()).current;
  const bounds = slideshowBounds(width, height, s);
  const image = pool[index % Math.max(1, pool.length)];
  useEffect(() => { setFailedUri(null); }, [image?.uri, s.enabled]);
  useEffect(() => {
    if (pool.length < 2 && !(s.sourceId && sourceResult?.hasMore)) return;
    const timer = setInterval(advance, s.seconds * 1000);
    return () => clearInterval(timer);
  }, [pool.length, s.seconds, s.sourceId, sourceResult?.hasMore, advance]);
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
          {failedUri !== image.uri && (
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
