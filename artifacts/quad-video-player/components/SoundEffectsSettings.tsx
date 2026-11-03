import React from 'react';
import { Feather } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { GameText as Text } from '@/components/GameText';
import { useColors } from '@/hooks/useColors';
import { useSoundSettings } from '@/hooks/useSoundSettings';
import {
  ADVANCED_EQ_PRESETS, DEFAULT_SOUND, EQ_PRESETS, type Reverb,
} from '@/lib/sound-settings';
import { ADVANCED_EQ_UNLOCK_LEVEL, levelForExperience } from '@/lib/player-rewards';
import SettingSwitch from './SettingSwitch';
import TouchSlider from './TouchSlider';

export default function SoundEffectsSettings({
  xp,
  allRewardsUnlocked,
}: { xp: number; allRewardsUnlocked: boolean }) {
  const colors = useColors();
  const { sound, setSound, loaded } = useSoundSettings();
  const disabled = !loaded || Platform.OS !== 'android';
  const advancedPresetsUnlocked = allRewardsUnlocked || levelForExperience(xp) >= ADVANCED_EQ_UNLOCK_LEVEL;
  const label = (text: string) => <Text style={[styles.label, { color: colors.foreground }]}>{text}</Text>;
  function chip(text: string, selected: boolean, onPress: () => void, locked = false) {
    return <Pressable key={text} accessibilityRole="radio" accessibilityLabel={text}
      accessibilityState={{ selected, disabled: disabled || locked }} disabled={disabled || locked} onPress={onPress}
      style={[styles.chip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: colors.secondary,
        opacity: locked ? 0.58 : 1 }]}>
      <View style={styles.chipContent}>
        {label(text)}
        {locked && <Feather name="lock" size={13} color={colors.mutedForeground} />}
      </View>
    </Pressable>;
  }
  return (
    <View style={[styles.section, { borderColor: colors.border }]}>
      {label('Sound playground')}
      <Text style={[styles.description, { color: colors.mutedForeground }]}>
        Applies to all videos and background tracks. Start quietly: simultaneous tracks add together. EQ boosts use extra headroom.
      </Text>
      <View style={styles.row}>
        {label('Reverb')}
        <SettingSwitch label="Reverb" disabled={disabled} value={sound.reverb !== 'off'}
          onValueChange={(value) => setSound((s) => ({ ...s, reverb: value ? 'room' : 'off' }))} />
      </View>
      {sound.reverb !== 'off' && <View style={styles.chips}>
        {([
          ['room', 'Cozy room'], ['chamber', 'Warm chamber'], ['hall', 'Concert hall'],
          ['cathedral', 'Cathedral'], ['plate', 'Studio plate'], ['spring', 'Vintage spring'],
        ] as [Exclude<Reverb, 'off'>, string][]).map(([reverb, name]) =>
          <View key={reverb}>{chip(name, sound.reverb === reverb, () => setSound((s) => ({ ...s, reverb })))}</View>)}
      </View>}
      {sound.reverb !== 'off' && <>
        {([
          { key: 'reverbMix', label: 'Wet / dry mix', min: 0, max: 100, step: 1, value: sound.reverbMix, suffix: '%' },
          { key: 'reverbDecay', label: 'Reverb decay', min: 20, max: 95, step: 1, value: sound.reverbDecay * 100, suffix: '%' },
          { key: 'preDelayMs', label: 'Pre-delay', min: 0, max: 120, step: 2, value: sound.preDelayMs, suffix: ' ms' },
        ] as const).map(({ key, label: title, min, max, step, value, suffix }) =>
          <View key={key}>
            <View style={styles.row}>{label(title)}{label(`${Math.round(value)}${suffix}`)}</View>
            <TouchSlider style={{ width: '100%', height: 44 }}
              value={value} minimumValue={min} maximumValue={max} step={step} disabled={disabled}
              accessibilityLabel={title} accessibilityValue={{ min, max, now: value }}
              minimumTrackTintColor={colors.primary} maximumTrackTintColor={colors.muted} thumbTintColor={colors.primary}
              onSlidingComplete={(next) => setSound((s) => ({
                ...s, [key]: key === 'reverbDecay' ? next / 100 : next,
              }))} />
          </View>)}
      </>}
      <View style={styles.row}>
        {label('Echo')}
        <SettingSwitch label="Echo" disabled={disabled} value={sound.echo}
          onValueChange={(echo) => setSound((s) => ({ ...s, echo }))} />
      </View>
      <View style={styles.row}>
        {label('5-band equalizer')}
        <SettingSwitch label="Equalizer" disabled={disabled} value={sound.eq}
          onValueChange={(eq) => setSound((s) => ({ ...s, eq }))} />
      </View>
      {sound.eq && <>
        <View style={styles.chips}>
          {Object.entries(EQ_PRESETS).map(([name, bands]) => chip(name,
            bands.every((value, i) => sound.bands[i] === value),
            () => setSound((s) => ({ ...s, bands: [...bands] }))))}
          {Object.entries(ADVANCED_EQ_PRESETS).map(([name, bands]) => chip(name,
            bands.every((value, i) => sound.bands[i] === value),
            () => setSound((s) => ({ ...s, bands: [...bands] })),
            !advancedPresetsUnlocked))}
        </View>
        {!advancedPresetsUnlocked && label(`More EQ presets unlock at level ${ADVANCED_EQ_UNLOCK_LEVEL}, or use Unlock everything.`)}
        {['60 Hz · Bass', '230 Hz · Warmth', '910 Hz · Mids', '3.6 kHz · Presence', '14 kHz · Air'].map((text, index) =>
          <View key={text}>
            <View style={styles.row}>{label(text)}{label(`${sound.bands[index] > 0 ? '+' : ''}${sound.bands[index]} dB`)}</View>
            <TouchSlider style={{ width: '100%', height: 44 }}
              minimumValue={-12} maximumValue={12} step={1} value={sound.bands[index]}
              disabled={disabled} accessibilityLabel={`${text} equalizer gain`}
              accessibilityValue={{ min: -12, max: 12, now: sound.bands[index], text: `${sound.bands[index]} decibels` }}
              minimumTrackTintColor={colors.primary} maximumTrackTintColor={colors.muted} thumbTintColor={colors.primary}
              onSlidingComplete={(value) => setSound((s) => ({ ...s, bands: s.bands.map((band, i) => i === index ? value : band) }))} />
          </View>)}
      </>}
      <Pressable accessibilityRole="button" disabled={disabled}
        onPress={() => setSound({ ...DEFAULT_SOUND, bands: [...DEFAULT_SOUND.bands] })}
        style={[styles.chip, { borderColor: colors.border, alignSelf: 'flex-start' }]}>
        {label('Reset sound effects')}
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  section: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 16, gap: 12 },
  label: { fontSize: 13, fontWeight: '600' },
  description: { fontSize: 12, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderRadius: 10 },
  chipContent: { flexDirection: 'row', alignItems: 'center', gap: 7 },
});
