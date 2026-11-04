import { Feather } from '@expo/vector-icons';
import React, { type ComponentProps } from 'react';
import { Image, View, type ImageSourcePropType } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export const RAVEN_ICONS: Record<string, ImageSourcePropType> = {
  sword: require('../assets/icons/raven/sword.png'),
  star: require('../assets/icons/raven/star.png'),
  trophy: require('../assets/icons/raven/trophy.png'),
  town: require('../assets/icons/raven/town.png'),
  bag: require('../assets/icons/raven/bag.png'),
  chest: require('../assets/icons/raven/chest.png'),
  scroll: require('../assets/icons/raven/scroll.png'),
  shield: require('../assets/icons/raven/shield.png'),
};
const GAME_ACTIONS: Record<string, string> = {
  home: 'town', award: 'trophy', shield: 'shield', star: 'star',
  'shopping-bag': 'bag', gift: 'chest', 'book-open': 'scroll',
  book: 'scroll', target: 'sword', folder: 'chest', film: 'scroll',
  'bar-chart-2': 'trophy', 'play-circle': 'sword', 'zap': 'star',
};
const PIXEL_SYMBOLS: Record<string, string[]> = {
  play: ['0100000','0110000','0111000','0111100','0111000','0110000','0100000'],
  pause: ['0110110','0110110','0110110','0110110','0110110','0110110','0110110'],
  square: ['0000000','0111110','0111110','0111110','0111110','0111110','0000000'],
  'skip-back': ['1000100','1001100','1011100','1111100','1011100','1001100','1000100'],
  'skip-forward': ['0010001','0011001','0011101','0011111','0011101','0011001','0010001'],
  repeat: ['0011110','0100011','0100001','0000000','1000010','1100010','0111100'],
  grid: ['1110111','1010101','1110111','0000000','1110111','1010101','1110111'],
  x: ['1000001','0100010','0010100','0001000','0010100','0100010','1000001'],
  'message-circle': ['0111110','1000001','1010101','1000001','0111110','0010000','0100000'],
  headphones: ['0011100','0100010','1000001','1100011','1100011','1100011','0000000'],
  settings: ['0011100','0110110','1100011','1011101','1100011','0110110','0011100'],
  'volume-2': ['0001000','0011010','1111001','1111101','1111001','0011010','0001000'],
  'volume-x': ['0001000','0011000','1111010','1111001','1111010','0011000','0001000'],
};

/** Full-colour uploaded artwork for RPG actions; conventional symbols for playback. */
export default function GameIcon({ name, size = 20, color, style, ...props }: ComponentProps<typeof Feather>) {
  const source = name ? RAVEN_ICONS[GAME_ACTIONS[name]] : undefined;
  const pixels = name ? PIXEL_SYMBOLS[name] : undefined;
  if (pixels) {
    const d = pixels.flatMap((row, y) => row.split('').flatMap((on, x) =>
      on === '1' ? [`M${x} ${y}h1v1h-1z`] : [])).join('');
    return <Svg width={size} height={size} viewBox="0 0 7 7" style={style} accessible={false}>
      <Path d={d} fill={color ?? 'currentColor'} />
    </Svg>;
  }
  return source
    ? <View style={[{ width: size, height: size }, style]} accessible={false}>
        <Image source={source} resizeMode="contain" accessible={false}
          style={{ width: size, height: size }} />
      </View>
    : <Feather {...props} name={name} size={size} color={color} style={style} />;
}
GameIcon.glyphMap = Feather.glyphMap;
