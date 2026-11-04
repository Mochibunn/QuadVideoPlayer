import React, { type PropsWithChildren } from 'react';
import { View, type StyleProp, type TextStyle } from 'react-native';
import { GameText } from './GameText';
import { useColors } from '@/hooks/useColors';

export default function OutlinedGameText({ children, style }: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  const colors = useColors();
  return <View style={{ alignSelf: 'center', width: '100%', maxWidth: 500 }}>
    {[-1, 0, 1].flatMap((x) => [-1, 0, 1].map((y) => x || y
      ? <GameText key={`${x}:${y}`} accessible={false} importantForAccessibility="no-hide-descendants"
          style={[style, { position: 'absolute', top: y * 2, left: x * 2, right: -x * 2,
            textAlign: 'center', color: colors.background }]}>{children}</GameText>
      : null))}
    <GameText style={[style, { textAlign: 'center', textShadowColor: colors.background,
      textShadowOffset: { width: 3, height: 4 }, textShadowRadius: 4 }]}>{children}</GameText>
  </View>;
}
