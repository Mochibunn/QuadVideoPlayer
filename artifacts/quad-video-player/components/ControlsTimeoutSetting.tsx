import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { MAX_CONTROLS_HIDE_SECONDS, parseControlsHideSeconds } from '@/lib/controls-visibility';
import TouchSlider from './TouchSlider';

export default function ControlsTimeoutSetting({
  value,
  onChange,
  disabled,
}: { value: number; onChange: (value: number) => void; disabled: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
      <View style={styles.heading}>
        <Text style={[styles.title, { color: colors.foreground }]}>Controls auto-hide</Text>
        <Text style={[styles.value, { color: colors.primary }]}>{value === 0 ? 'Never' : `${value} s`}</Text>
      </View>
      <Text style={[styles.description, { color: colors.mutedForeground }]}>
        {value === 0
          ? 'Automatic fading is off. Tap a video to hide or show controls.'
          : `Fade controls after ${value} ${value === 1 ? 'second' : 'seconds'} without interaction. Tap a video to hide or show them immediately.`}
      </Text>
      <TouchSlider
        style={styles.slider}
        accessibilityLabel="Controls auto-hide delay in seconds"
        accessibilityValue={{ min: 0, max: MAX_CONTROLS_HIDE_SECONDS, now: value, text: value === 0 ? 'Never auto-hide' : `${value} seconds` }}
        minimumValue={0}
        maximumValue={MAX_CONTROLS_HIDE_SECONDS}
        step={1}
        value={value}
        disabled={disabled}
        onSlidingComplete={(seconds) => onChange(parseControlsHideSeconds(seconds))}
        minimumTrackTintColor={colors.primary}
        maximumTrackTintColor={colors.mutedForeground}
        thumbTintColor={colors.primary}
      />
      <View style={styles.heading}>
        <Text style={[styles.endpoint, { color: colors.mutedForeground }]}>0 · Never</Text>
        <Text style={[styles.endpoint, { color: colors.mutedForeground }]}>30 seconds</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 16, gap: 8 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  value: { fontSize: 14, fontWeight: '700', minWidth: 50, textAlign: 'right' },
  description: { fontSize: 12, lineHeight: 18 },
  slider: { width: '100%', height: 48 },
  endpoint: { fontSize: 11 },
});
