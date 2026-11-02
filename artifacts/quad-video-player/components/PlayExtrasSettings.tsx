import { Feather } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import SettingSwitch from '@/components/SettingSwitch';
import TouchSlider from '@/components/TouchSlider';
import { useColors } from '@/hooks/useColors';
import type { PlayExtrasSettings as Settings } from '@/lib/play-extras';

type Props = {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  ready: boolean;
};

export default function PlayExtrasSettings({ settings, update, ready }: Props) {
  const colors = useColors();
  const rowStyle = [styles.row, { backgroundColor: colors.secondary, borderColor: colors.border }];

  return (
    <View style={styles.section}>
      <Text style={[styles.kicker, { color: colors.primary }]}>DEN ATMOSPHERE</Text>
      <Text style={[styles.heading, { color: colors.foreground }]}>Guild ambience</Text>
      <View style={rowStyle}>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.foreground }]}>Speak milestones</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            Let the guild mark your milestones aloud.
          </Text>
        </View>
        <SettingSwitch label="Speak milestones" value={settings.speakCelebrations}
          onValueChange={(value) => update({ speakCelebrations: value })} disabled={!ready} />
      </View>
      <View style={rowStyle}>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.foreground }]}>Speak quest dialogue</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            Hear brief class calls and den updates.
          </Text>
        </View>
        <SettingSwitch label="Speak quest dialogue" value={settings.speakDialogue}
          onValueChange={(value) => update({ speakDialogue: value })} disabled={!ready} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Test Android text to speech"
        onPress={() => Speech.speak('Guild ledger updated. Your next moonlit run awaits.', { rate: 0.95 })}
        style={[styles.testButton, { backgroundColor: colors.secondary, borderColor: colors.border }]}
      >
        <Feather name="volume-2" size={16} color={colors.primary} />
          <Text style={[styles.testText, { color: colors.foreground }]}>Hear guild voice</Text>
      </Pressable>
      <View style={rowStyle}>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.foreground }]}>Dangling keys and jingle</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            Let a little key charm sway and chime softly while the streams play.
          </Text>
        </View>
        <SettingSwitch label="Show dangling keys and play jingle" value={settings.keysEnabled}
          onValueChange={(value) => update({ keysEnabled: value })} disabled={!ready} />
      </View>
      <View style={[styles.sliderCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <View style={styles.sliderHeader}>
          <Text style={[styles.title, { color: colors.foreground }]}>Charm chime interval</Text>
          <Text style={[styles.value, { color: colors.primary }]}>{settings.keyRepeatSeconds}s</Text>
        </View>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          Repeat every 5–300 seconds during an active run.
        </Text>
        <TouchSlider
          style={styles.slider}
          accessibilityLabel="Key jingle repeat interval"
          accessibilityValue={{ min: 5, max: 300, now: settings.keyRepeatSeconds }}
          minimumValue={5}
          maximumValue={300}
          step={5}
          value={settings.keyRepeatSeconds}
          disabled={!ready}
          onSlidingComplete={(value) => update({ keyRepeatSeconds: Math.round(value / 5) * 5 })}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.muted}
          thumbTintColor={colors.primary}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10, marginTop: 8 },
  kicker: { fontSize: 8, fontWeight: '900', letterSpacing: 1.5, marginTop: 4 },
  heading: { fontSize: 16, fontWeight: '800', marginTop: -7 },
  row: { borderWidth: 1, borderRadius: 15, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 13, fontWeight: '600' },
  description: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  testButton: { minHeight: 40, borderWidth: 1, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  testText: { fontSize: 12, fontWeight: '600' },
  sliderCard: { borderWidth: 1, borderRadius: 15, padding: 13 },
  sliderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  value: { fontSize: 12, fontWeight: '700' },
  slider: { width: '100%', height: 38, marginTop: 8 },
});
