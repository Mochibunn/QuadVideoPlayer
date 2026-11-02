import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import SettingSwitch from '@/components/SettingSwitch';
import TouchSlider from '@/components/TouchSlider';
import { useColors } from '@/hooks/useColors';
import {
  ANIMATED_BORDER_LEVEL, borderOptions, experienceIntoLevel, experienceUntilNextLevel, nextRewardMilestone,
  isBorderUnlocked, levelForExperience, PUZZLED_TEXTURE_SCALE_MAX, PUZZLED_TEXTURE_SCALE_MIN, XP_PER_LEVEL,
  type BorderDirection, type BorderStyleId, type PlayerRewardsSettings,
} from '@/lib/player-rewards';
import { playerRankTitle } from '@/lib/player-achievements';

const directionOptions: { id: BorderDirection; icon: keyof typeof Feather.glyphMap; label: string }[] = [
  { id: 'left', icon: 'arrow-left', label: 'Left' },
  { id: 'right', icon: 'arrow-right', label: 'Right' },
  { id: 'up', icon: 'arrow-up', label: 'Up' },
  { id: 'down', icon: 'arrow-down', label: 'Down' },
];

export default function PlayerRewardsSettings({
  settings,
  update,
  xp,
  ready,
  error,
}: {
  settings: PlayerRewardsSettings;
  update: (patch: Partial<PlayerRewardsSettings>) => void;
  xp: number;
  ready: boolean;
  error: string;
}) {
  const colors = useColors();
  const level = levelForExperience(xp);
  const levelProgress = experienceIntoLevel(xp) / XP_PER_LEVEL;
  const animationUnlocked = settings.allRewardsUnlocked || level >= ANIMATED_BORDER_LEVEL;
  const disabled = !ready || !!error;
  const scrollSwitchDisabled = disabled || !animationUnlocked;
  const directionDisabled = disabled || !animationUnlocked || settings.borderStyle !== 'puzzled';
  const nextReward = nextRewardMilestone(xp);
  const setBorder = (id: BorderStyleId) => update({ borderStyle: id });

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Session rewards & borders</Text>
      <Text style={[styles.description, { color: colors.mutedForeground }]}>
        Earn 1 XP per active playback minute. Every 10 XP raises your level.
      </Text>
      <View style={styles.levelHeading}>
        <View>
          <Text style={[styles.level, { color: colors.primary }]}>LEVEL {level}</Text>
          <Text style={[styles.rankTitle, { color: colors.mutedForeground }]}>{playerRankTitle(level)}</Text>
        </View>
        <Text style={[styles.xp, { color: colors.foreground }]}>{xp} XP · {experienceUntilNextLevel(xp)} to next level</Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
        <View style={[styles.progressFill, { width: `${Math.round(levelProgress * 100)}%`, backgroundColor: colors.primary }]} />
      </View>
      <Text style={[styles.unlockHint, { color: colors.mutedForeground }]}>
        {settings.allRewardsUnlocked
          ? 'All themes, borders, animated borders, and advanced EQ presets are unlocked.'
          : nextReward
            ? `${nextReward.description} unlock at level ${nextReward.level}.`
            : 'All current rewards are unlocked.'}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || settings.allRewardsUnlocked }}
        disabled={disabled || settings.allRewardsUnlocked}
        onPress={() => update({ allRewardsUnlocked: true })}
        style={[
          styles.unlockAllButton,
          { backgroundColor: settings.allRewardsUnlocked ? colors.accent : colors.primary,
            borderColor: colors.primary, opacity: disabled ? 0.55 : 1 },
        ]}
      >
        <Feather name={settings.allRewardsUnlocked ? 'unlock' : 'zap'} size={17}
          color={settings.allRewardsUnlocked ? colors.primary : colors.primaryForeground} />
        <View style={styles.unlockAllCopy}>
          <Text style={[styles.unlockAllTitle, { color: settings.allRewardsUnlocked ? colors.primary : colors.primaryForeground }]}>
            {settings.allRewardsUnlocked ? 'Everything unlocked' : 'Unlock everything'}
          </Text>
          <Text style={[styles.unlockAllDescription, { color: settings.allRewardsUnlocked ? colors.mutedForeground : colors.primaryForeground }]}>
            {settings.allRewardsUnlocked
              ? 'XP and your session history remain unchanged.'
              : 'Skip the XP gates for themes, borders, and advanced EQ presets.'}
          </Text>
        </View>
      </Pressable>

      <View style={styles.settingRow}>
        <View style={styles.settingCopy}>
          <Text style={[styles.label, { color: colors.foreground }]}>Quarter frames</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>Frame each video quadrant separately.</Text>
        </View>
        <SettingSwitch label="Show quarter frames" value={settings.borderEnabled} disabled={disabled}
          onValueChange={(borderEnabled) => update({ borderEnabled })} />
      </View>

      <View style={styles.options}>
        {borderOptions.map((option) => {
          const unlocked = isBorderUnlocked(option.id, xp, settings.allRewardsUnlocked);
          const selected = settings.borderStyle === option.id;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: disabled || !unlocked }}
              disabled={disabled || !unlocked}
              onPress={() => setBorder(option.id)}
              style={[
                styles.option,
                { borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.accent : colors.background,
                  opacity: unlocked ? 1 : 0.52 },
              ]}
            >
              <View style={[styles.swatch, { backgroundColor: option.id === 'gamecubed' || option.id === 'nebula' ? colors.primary
                : option.id === 'arcade' ? colors.accentForeground
                  : option.id === 'prism' ? '#f6392c' : option.id === 'aurora' ? '#76b8b2' : '#edb71f' }]} />
              <View style={styles.optionText}>
                <Text style={[styles.optionName, { color: colors.foreground }]}>{option.name}</Text>
                <Text style={[styles.optionMeta, { color: colors.mutedForeground }]}>
                  {unlocked ? (selected ? 'Selected' : `Level ${option.unlockLevel}`) : `Unlock at level ${option.unlockLevel}`}
                </Text>
              </View>
              {!unlocked && <Feather name="lock" size={15} color={colors.mutedForeground} />}
            </Pressable>
          );
        })}
      </View>

      {settings.borderStyle === 'puzzled' && (
        <View style={styles.textureSetting}>
          <View style={styles.levelHeading}>
            <View style={styles.settingCopy}>
              <Text style={[styles.label, { color: colors.foreground }]}>Puzzle texture scale</Text>
              <Text style={[styles.description, { color: colors.mutedForeground }]}>Change the size of the repeating puzzle pieces.</Text>
            </View>
            <Text style={[styles.optionMeta, { color: colors.primary }]}>{Math.round(settings.textureScale * 100)}%</Text>
          </View>
          <TouchSlider
            style={{ width: '100%', height: 44 }}
            accessibilityLabel="Puzzle texture scale"
            accessibilityValue={{ min: 50, max: 250, now: Math.round(settings.textureScale * 100) }}
            minimumValue={PUZZLED_TEXTURE_SCALE_MIN}
            maximumValue={PUZZLED_TEXTURE_SCALE_MAX}
            step={0.1}
            value={settings.textureScale}
            disabled={disabled}
            onSlidingComplete={(textureScale) => update({ textureScale })}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.mutedForeground}
            thumbTintColor={colors.primary}
          />
        </View>
      )}

      <View style={styles.settingRow}>
        <View style={styles.settingCopy}>
          <Text style={[styles.label, { color: colors.foreground }]}>Scroll border pattern</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            {settings.borderStyle !== 'puzzled'
              ? 'Select Puzzled to scroll its texture.'
              : animationUnlocked ? 'Move the Puzzled texture around the frame.' : `Unlocks at level ${ANIMATED_BORDER_LEVEL}.`}
          </Text>
        </View>
        <SettingSwitch label="Scroll border pattern" value={settings.scrollBorder}
          disabled={scrollSwitchDisabled}
          onValueChange={(scrollBorder) => update({ scrollBorder })} />
      </View>

      {settings.scrollBorder && settings.borderStyle === 'puzzled' && (
        <View style={{ gap: 8, opacity: directionDisabled ? 0.55 : 1 }}>
          <Text style={[styles.label, { color: colors.foreground }]}>Direction</Text>
          <View style={styles.directionRow}>
            {directionOptions.map((option) => {
              const selected = settings.scrollDirection === option.id;
              return (
                <Pressable key={option.id} accessibilityRole="radio"
                  accessibilityLabel={`Scroll ${option.label.toLowerCase()}`}
                  accessibilityState={{ checked: selected, disabled: directionDisabled }}
                  disabled={directionDisabled}
                  onPress={() => update({ scrollDirection: option.id })}
                  style={[styles.directionButton, {
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.accent : colors.background,
                  }]}>
                  <Feather name={option.icon} size={17} color={selected ? colors.primary : colors.foreground} />
                  <Text style={[styles.directionLabel, { color: colors.foreground }]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.levelHeading}>
            <Text style={[styles.label, { color: colors.foreground }]}>Scroll speed</Text>
            <Text style={[styles.optionMeta, { color: colors.mutedForeground }]}>{settings.scrollSpeed}/10</Text>
          </View>
          <TouchSlider
            style={{ width: '100%', height: 44 }}
            accessibilityLabel="Border scroll speed"
            accessibilityValue={{ min: 1, max: 10, now: settings.scrollSpeed }}
            minimumValue={1} maximumValue={10} step={1} value={settings.scrollSpeed}
            disabled={directionDisabled}
            onSlidingComplete={(scrollSpeed) => update({ scrollSpeed })}
            minimumTrackTintColor={colors.primary} maximumTrackTintColor={colors.mutedForeground}
            thumbTintColor={colors.primary}
          />
        </View>
      )}

      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <Text style={[styles.label, { color: colors.foreground }]}>Milestone messages</Text>
      <Text style={[styles.description, { color: colors.mutedForeground }]}>
        One message per line. A message appears with confetti every 10 active minutes.
      </Text>
      <TextInput
        accessibilityLabel="Editable session congratulations messages"
        editable={!disabled}
        multiline
        maxLength={1_000}
        value={settings.congratsText}
        onChangeText={(congratsText) => update({ congratsText })}
        placeholder="Write one message per line"
        placeholderTextColor={colors.mutedForeground}
        textAlignVertical="top"
        returnKeyType="default"
        style={[styles.messageInput, {
          color: colors.foreground, borderColor: colors.input, backgroundColor: colors.background,
        }]}
      />
      {!!error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  description: { fontSize: 12, lineHeight: 18 },
  levelHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  level: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
  rankTitle: { fontSize: 10, fontWeight: '700', marginTop: 2 },
  xp: { fontSize: 12, fontWeight: '600', textAlign: 'right' },
  progressTrack: { height: 7, borderRadius: 6, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 6 },
  unlockHint: { fontSize: 11, lineHeight: 16 },
  unlockAllButton: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 56,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  unlockAllCopy: { flex: 1, gap: 2 },
  unlockAllTitle: { fontSize: 13, fontWeight: '800' },
  unlockAllDescription: { fontSize: 10, lineHeight: 15 },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  settingCopy: { flex: 1, gap: 3 },
  label: { fontSize: 13, fontWeight: '600' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { minWidth: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 9,
    borderWidth: 1, borderRadius: 10, padding: 10 },
  swatch: { width: 24, height: 24, borderRadius: 7 },
  optionText: { flex: 1, gap: 2 },
  optionName: { fontSize: 12, fontWeight: '700' },
  optionMeta: { fontSize: 10 },
  textureSetting: { gap: 4 },
  directionRow: { flexDirection: 'row', gap: 7 },
  directionButton: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8,
    borderRadius: 9, borderWidth: 1 },
  directionLabel: { fontSize: 10, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  messageInput: { borderWidth: 1, borderRadius: 10, minHeight: 115, padding: 12, fontSize: 14, lineHeight: 20 },
  error: { fontSize: 12 },
});
