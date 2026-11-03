import { Feather } from '@expo/vector-icons';
import React, { type ComponentProps } from 'react';
import { Image, View, type ImageSourcePropType } from 'react-native';

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
  book: 'scroll', target: 'sword',
};

/** Full-colour uploaded artwork for RPG actions; conventional symbols for playback. */
export default function GameIcon({ name, size = 20, color, style, ...props }: ComponentProps<typeof Feather>) {
  const source = name ? RAVEN_ICONS[GAME_ACTIONS[name]] : undefined;
  return source
    ? <View style={[{ width: size, height: size }, style]} accessible={false}>
        <Image source={source} resizeMode="contain" accessible={false}
          style={{ width: size, height: size }} />
      </View>
    : <Feather {...props} name={name} size={size} color={color} style={style} />;
}
