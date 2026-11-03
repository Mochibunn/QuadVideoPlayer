import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

export type PinItem = {
  kind: 'quest' | 'honor';
  id: string;
  title: string;
  progress: number;
  target: number;
  done: boolean;
};

/** Small translucent tracker in the top-right corner; visible even when the board is closed. */
export default function QuestPins({ items, onUnpin, onOpen }: {
  items: PinItem[];
  onUnpin: (kind: PinItem['kind'], id: string) => void;
  onOpen: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  if (!items.length) return null;
  return (
    <View pointerEvents="box-none" style={[styles.layer, { top: insets.top + 56, right: insets.right + 10 }]}>
      {items.map((item) => {
        const ratio = Math.max(0, Math.min(1, item.target > 0 ? item.progress / item.target : 0));
        return (
          <Pressable key={`${item.kind}-${item.id}`} accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${Math.min(item.progress, item.target)} of ${item.target}. Open guild board.`}
            onPress={onOpen}
            style={[styles.pin, { borderColor: item.done ? colors.primary : 'rgba(255,255,255,0.12)' }]}>
            <View style={styles.row}>
              <Feather name={item.kind === 'quest' ? 'bookmark' : 'award'} size={11} color={colors.primary} />
              <Text numberOfLines={1} style={[styles.title, { color: colors.foreground }]}>{item.title}</Text>
              <Text style={[styles.count, { color: item.done ? colors.primary : colors.mutedForeground }]}>
                {item.done ? 'READY' : `${Math.min(item.progress, item.target)}/${item.target}`}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Unpin ${item.title}`} hitSlop={10}
                onPress={() => onUnpin(item.kind, item.id)}>
                <Feather name="x" size={11} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { backgroundColor: colors.primary, width: `${ratio * 100}%` }]} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', width: 214, gap: 4, zIndex: 95, elevation: 95 },
  pin: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, gap: 4, backgroundColor: 'rgba(0,0,0,0.46)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  title: { flex: 1, fontSize: 10, fontWeight: '800' },
  count: { fontSize: 9, fontWeight: '900', fontVariant: ['tabular-nums'] },
  track: { height: 3, borderRadius: 1, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.14)' },
  fill: { height: '100%' },
});
