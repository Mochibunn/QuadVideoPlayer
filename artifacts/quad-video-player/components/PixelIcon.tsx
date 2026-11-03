import React from 'react';
import { Image, View } from 'react-native';
import { RAVEN_ICONS } from './GameIcon';

const PIXELS: Record<string, string[]> = {
  paw: ['10001', '11111', '10101', '01110', '00100'],
  heart: ['01010', '11111', '11111', '01110', '00100'],
  sword: ['00001', '00011', '00110', '01100', '11000'],
  star: ['00100', '00100', '11111', '01110', '11011'],
  scroll: ['01110', '11011', '10101', '11011', '01110'],
  film: ['11111', '10101', '11111', '10101', '11111'],
};

export default function PixelIcon({ name, color, size = 20 }: {
  name: keyof typeof PIXELS;
  color: string;
  size?: number;
}) {
  if (RAVEN_ICONS[name]) {
    return <Image source={RAVEN_ICONS[name]} resizeMode="contain" accessible={false}
      style={{ width: size, height: size }} />;
  }
  const cells = PIXELS[name] ?? PIXELS.star;
  const pixel = size / 5;
  return (
    <View accessibilityElementsHidden style={{ width: size, height: size, flexDirection: 'row', flexWrap: 'wrap' }}>
      {cells.join('').split('').map((active, index) => (
        <View key={index} style={{ width: pixel, height: pixel, backgroundColor: active === '1' ? color : 'transparent' }} />
      ))}
    </View>
  );
}
