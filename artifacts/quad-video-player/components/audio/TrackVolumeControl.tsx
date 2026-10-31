import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

type Props = {
  name: string;
  value: number;
  onChange: (value: number) => void;
};

export default function TrackVolumeControl({ name, value, onChange }: Props) {
  const colors = useColors();
  const [width, setWidth] = useState(0);
  const percentage = Math.round(value * 100);
  const update = (x: number) => {
    if (width > 0) onChange(Math.max(0, Math.min(1, x / width)));
  };
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>Volume</Text>
      <View
        style={styles.hitbox}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`Volume for ${name}`}
        accessibilityValue={{ min: 0, max: 100, now: percentage, text: `${percentage}%` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'increment') onChange(Math.min(1, value + 0.05));
          if (nativeEvent.actionName === 'decrement') onChange(Math.max(0, value - 0.05));
        }}
        onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={({ nativeEvent }) => update(nativeEvent.locationX)}
        onResponderMove={({ nativeEvent }) => update(nativeEvent.locationX)}
        onResponderTerminationRequest={() => false}
      >
        <View pointerEvents="none" style={[styles.track, { backgroundColor: colors.muted }]}>
          <View style={[styles.fill, { width: `${percentage}%`, backgroundColor: colors.primary }]} />
        </View>
        <View
          pointerEvents="none"
          style={[styles.knob, { left: `${percentage}%`, backgroundColor: colors.primary }]}
        />
      </View>
      <Text style={[styles.percentage, { color: colors.foreground }]}>{percentage}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { fontSize: 12 },
  hitbox: { flex: 1, height: 44, justifyContent: 'center', marginHorizontal: 8 },
  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 5 },
  knob: { position: 'absolute', width: 16, height: 16, borderRadius: 8, marginLeft: -8 },
  percentage: { width: 42, textAlign: 'right', fontSize: 12, fontVariant: ['tabular-nums'] },
});
