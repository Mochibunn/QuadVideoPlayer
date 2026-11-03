import React, { useEffect, useRef, type PropsWithChildren } from 'react';
import { Animated, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

/** Leave the overlay mounted so fading never changes the playback layout. */
export default function FadingControls({
  visible,
  style,
  children,
  interactive = true,
  onLayout,
}: PropsWithChildren<{ visible: boolean; style?: StyleProp<ViewStyle>; interactive?: boolean; onLayout?: (event: LayoutChangeEvent) => void }>) {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    const animation = Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [opacity, visible]);

  return (
    <Animated.View
      onLayout={onLayout}
      style={[style, { opacity }]}
      pointerEvents={visible && interactive ? 'box-none' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      {children}
    </Animated.View>
  );
}
