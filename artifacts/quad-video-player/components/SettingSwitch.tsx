import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

/** Always show the actual boolean state, independent of Android switch styling. */
export default function SettingSwitch({
  label,
  value,
  onValueChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={styles.control}>
      <Text
        importantForAccessibility="no"
        style={[styles.state, { color: value ? colors.primary : colors.mutedForeground }]}
      >
        {value ? 'ON' : 'OFF'}
      </Text>
      <Switch
        accessibilityLabel={label}
        accessibilityState={{ checked: value, disabled }}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.muted, true: colors.primary }}
        thumbColor={value ? colors.primaryForeground : colors.mutedForeground}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  control: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  state: { fontSize: 10, fontWeight: '700', minWidth: 24, textAlign: 'right' },
});
