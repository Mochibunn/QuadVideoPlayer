import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { useVideoPlayer } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = { enabled: boolean; playing: boolean; repeatSeconds: number };

export default function KeyJingleOverlay({ enabled, playing, repeatSeconds }: Props) {
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const swing = useRef(new Animated.Value(0)).current;
  const player = useVideoPlayer(require('../assets/audio/key-jingle.wav'), (instance) => {
    const audioOnly = instance as typeof instance & { audioOnly?: boolean };
    if (typeof audioOnly.audioOnly === 'boolean') audioOnly.audioOnly = true;
    instance.loop = false;
    instance.volume = 0.48;
    instance.audioMixingMode = 'mixWithOthers';
    instance.staysActiveInBackground = false;
  });

  useEventListener(player, 'statusChange', ({ status }) => setReady(status === 'readyToPlay'));

  useEffect(() => {
    if (!enabled || !playing || !ready) {
      player.pause();
      return;
    }
    const playJingle = () => {
      player.currentTime = 0;
      player.play();
    };
    playJingle();
    const timer = setInterval(playJingle, Math.max(5, repeatSeconds) * 1000);
    return () => {
      clearInterval(timer);
      player.pause();
    };
  }, [enabled, playing, player, ready, repeatSeconds]);

  useEffect(() => {
    if (!enabled) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(swing, { toValue: 1, duration: 1150, useNativeDriver: true }),
      Animated.timing(swing, { toValue: -1, duration: 2300, useNativeDriver: true }),
      Animated.timing(swing, { toValue: 0, duration: 1150, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [enabled, swing]);

  if (!enabled) return null;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLabel="Dangling key charm"
      style={[
        styles.charm,
        { top: Math.max(8, insets.top + 6), transform: [{ rotate: swing.interpolate({
          inputRange: [-1, 0, 1], outputRange: ['-11deg', '0deg', '11deg'],
        }) }] },
      ]}
    >
      <Image
        source={require('../assets/images/keys-dangling-transparent.png')}
        contentFit="contain"
        style={StyleSheet.absoluteFill}
        accessibilityLabel="Dangling keys"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  charm: {
    position: 'absolute',
    zIndex: 12,
    right: 14,
    width: 68,
    height: 102,
  },
});
