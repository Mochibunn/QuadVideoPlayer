import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { GameText as Text } from '@/components/GameText';
import SettingSwitch from '@/components/SettingSwitch';
import TouchSlider from '@/components/TouchSlider';
import { useColors } from '@/hooks/useColors';
import {
  ANIMATED_BORDER_LEVEL, borderOptions, experienceIntoLevel, experienceUntilNextLevel, nextRewardMilestone,
  BORDER_THICKNESS_MAX, BORDER_THICKNESS_MIN, effectiveBorderThickness, isBorderUnlocked, isTexturedBorder, TRANS_FLAG_COLORS, levelForExperience, PUZZLED_TEXTURE_SCALE_MAX, PUZZLED_TEXTURE_SCALE_MIN, XP_PER_LEVEL,
  type BorderDirection, type BorderStyleId, type PlayerRewardsSettings,
} from '@/lib/player-rewards';
import { playerRankTitle } from '@/lib/player-achievements';

const directionOptions: { id: BorderDirection; icon: keyof typeof Feather.glyphMap; label: string }[] = [
  { id: 'left', icon: 'arrow-left', label: 'Left' },
  { id: 'right', icon: 'arrow-right', label: 'Right' },
  { id: 'up', icon: 'arrow-up', label: 'Up' },
  { id: 'down', icon: 'arrow-down', label: 'Down' },
  { id: 'up-left', icon: 'arrow-up-left', label: 'NW' },
  { id: 'up-right', icon: 'arrow-up-right', label: 'NE' },
  { id: 'down-left', icon: 'arrow-down-left', label: 'SW' },
  { id: 'down-right', icon: 'arrow-down-right', label: 'SE' },
];

export default function PlayerRewardsSettings({
  settings,
  update,
  xp,
  ready,
  error,
  onGenerateCelebrations,
  generatingCelebrations = false,
  generatedCelebrations = [],
}: {
  settings: PlayerRewardsSettings;
  update: (patch: Partial<PlayerRewardsSettings>) => void;
  xp: number;
  ready: boolean;
  error: string;
  /** Optional: regenerates the cheer lines (e.g. via the local story model). */
  onGenerateCelebrations?: () => Promise<void>;
  generatingCelebrations?: boolean;
  generatedCelebrations?: readonly string[];
}) {
  const colors = useColors();
  const level = levelForExperience(xp);
  const levelProgress = experienceIntoLevel(xp) / XP_PER_LEVEL;
  const animationUnlocked = settings.allRewardsUnlocked || level >= ANIMATED_BORDER_LEVEL;
  const disabled = !ready || !!error;
  const scrollSwitchDisabled = disabled || !animationUnlocked;
  const texturedSelected = isTexturedBorder(settings.borderStyle);
  const directionDisabled = disabled || !animationUnlocked || !texturedSelected;
  const [scaleDraft, setScaleDraft] = useState<number | null>(null);
  const shownScale = scaleDraft ?? settings.textureScale;
  const [thicknessDraft, setThicknessDraft] = useState<number | null>(null);
  const shownThickness = thicknessDraft ?? effectiveBorderThickness(settings.borderStyle, settings.borderThickness);
  const [generateError, setGenerateError] = useState('');
  const nextReward = nextRewardMilestone(xp);
  const setBorder = (id: BorderStyleId) => update({ borderStyle: id });

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
      <Text style={[styles.kicker, { color: colors.primary }]}>GUILD PROGRESSION</Text>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Session spoils & frames</Text>
      <Text style={[styles.description, { color: colors.mutedForeground }]}>
        Earn 1 XP for each active minute. Every 10 XP earns a new guild rank.
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
          ? 'Every theme, frame, moving pattern, and advanced EQ preset is yours.'
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
            {settings.allRewardsUnlocked ? 'The whole armory is open' : 'Open the whole armory'}
          </Text>
          <Text style={[styles.unlockAllDescription, { color: settings.allRewardsUnlocked ? colors.mutedForeground : colors.primaryForeground }]}>
            {settings.allRewardsUnlocked
              ? 'Your XP and session history remain unchanged.'
              : 'Open every theme, frame, and advanced EQ preset at once.'}
          </Text>
        </View>
      </Pressable>

      <View style={styles.settingRow}>
        <View style={styles.settingCopy}>
          <Text style={[styles.label, { color: colors.foreground }]}>Screen frame</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>Four quadrant frames in quad view; one frame around a fullscreen stream.</Text>
        </View>
        <SettingSwitch label="Show screen frame" value={settings.borderEnabled} disabled={disabled}
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
              {option.id.startsWith('trans') ? (
                <View style={[styles.swatch, { overflow: 'hidden' }]}>
                  {TRANS_FLAG_COLORS.map((c, i) => <View key={i} style={{ flex: 1, backgroundColor: c }} />)}
                </View>
              ) : <View style={[styles.swatch, { backgroundColor: option.id === 'gamecubed' || option.id === 'nebula' ? colors.primary
                : option.id === 'arcade' ? colors.accentForeground
                  : option.id === 'prism' ? '#f6392c' : option.id === 'aurora' ? '#76b8b2'
                    : option.id === 'pawprint' ? colors.accent : '#edb71f' }]}>
                {option.id === 'pawprint' && <MaterialCommunityIcons name="paw" size={15} color={colors.primary} style={{ margin: 4.5 }} />}
              </View>}
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

      <View style={[styles.textureSetting, { borderColor: colors.border, backgroundColor: colors.background }]}>
        <View style={styles.levelHeading}>
          <View style={styles.settingCopy}>
            <Text style={[styles.label, { color: colors.foreground }]}>Texture scale</Text>
            <Text style={[styles.description, { color: colors.mutedForeground }]}>
              {texturedSelected
                ? 'Size of the repeating pattern. Saved when you let go.'
                : 'Applies to patterned frames. Saved now, shown when one is picked.'}
            </Text>
          </View>
          <View style={[styles.scaleBadge, { borderColor: colors.primary, backgroundColor: colors.accent }]}>
            <Text style={[styles.scaleValue, { color: colors.primary }]}>{shownScale.toFixed(1)}×</Text>
          </View>
        </View>
        <View style={[styles.scalePreview, { borderColor: colors.border }]}
          accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {Array.from({ length: Math.max(3, Math.round(14 / shownScale)) }, (_, index) => (
            <MaterialCommunityIcons key={index} name={settings.borderStyle === 'pawprint' ? 'paw' : 'puzzle'}
              size={Math.round(10 * shownScale)} color={index % 2 ? colors.accentForeground : colors.primary}
              style={{ transform: [{ rotate: index % 2 ? '14deg' : '-14deg' }] }} />
          ))}
        </View>
        <TouchSlider
          style={{ width: '100%', height: 48 }}
          accessibilityLabel="Border texture scale"
          accessibilityValue={{ min: 50, max: 600, now: Math.round(shownScale * 100), text: `${shownScale.toFixed(1)} times` }}
          minimumValue={PUZZLED_TEXTURE_SCALE_MIN}
          maximumValue={PUZZLED_TEXTURE_SCALE_MAX}
          step={0.1}
          value={settings.textureScale}
          disabled={disabled}
          onDraftValueChange={(next) => setScaleDraft(Math.round(next * 10) / 10)}
          onSlidingComplete={(next) => {
            setScaleDraft(null);
            update({ textureScale: Math.round(next * 10) / 10 });
          }}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.mutedForeground}
          thumbTintColor={colors.primary}
        />
        <View style={styles.levelHeading}>
          <Text style={[styles.optionMeta, { color: colors.mutedForeground }]}>0.5× fine</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Reset texture scale to 1x" disabled={disabled}
            onPress={() => update({ textureScale: 1 })}>
            <Text style={[styles.optionMeta, { color: colors.primary }]}>Reset 1.0×</Text>
          </Pressable>
          <Text style={[styles.optionMeta, { color: colors.mutedForeground }]}>6.0× huge</Text>
        </View>
      </View>

      {(settings.borderStyle === 'pawprint' || settings.borderStyle === 'trans-paw') && (
        <View style={[styles.textureSetting, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <View style={styles.levelHeading}>
            <View style={styles.settingCopy}>
              <Text style={[styles.label, { color: colors.foreground }]}>Paw spacing</Text>
              <Text style={[styles.description, { color: colors.mutedForeground }]}>
                Adjust the repeat distance without changing paw size.
              </Text>
            </View>
            <View style={[styles.scaleBadge, { borderColor: colors.primary, backgroundColor: colors.accent }]}>
              <Text style={[styles.scaleValue, { color: colors.primary }]}>{settings.pawSpacing.toFixed(1)}×</Text>
            </View>
          </View>
          <TouchSlider
            style={{ width: '100%', height: 48 }}
            accessibilityLabel="Paw border spacing"
            accessibilityValue={{ min: 50, max: 300, now: Math.round(settings.pawSpacing * 100), text: `${settings.pawSpacing.toFixed(1)} times` }}
            minimumValue={0.5}
            maximumValue={3}
            step={0.1}
            value={settings.pawSpacing}
            disabled={disabled}
            onSlidingComplete={(value) => update({ pawSpacing: Math.round(value * 10) / 10 })}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.mutedForeground}
            thumbTintColor={colors.primary}
          />
          <View style={styles.levelHeading}>
            <Text style={[styles.optionMeta, { color: colors.mutedForeground }]}>0.5× close</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Reset paw spacing" disabled={disabled}
              onPress={() => update({ pawSpacing: 1 })}>
              <Text style={[styles.optionMeta, { color: colors.primary }]}>Reset 1.0×</Text>
            </Pressable>
            <Text style={[styles.optionMeta, { color: colors.mutedForeground }]}>3.0× wide</Text>
          </View>
        </View>
      )}

      <View style={[styles.textureSetting, { borderColor: colors.border, backgroundColor: colors.background }]}>
        <View style={styles.levelHeading}>
          <View style={styles.settingCopy}>
            <Text style={[styles.label, { color: colors.foreground }]}>Frame thickness</Text>
            <Text style={[styles.description, { color: colors.mutedForeground }]}>
              {settings.borderThickness == null ? 'Using the style default. ' : ''}Saved when you let go.
            </Text>
          </View>
          <View style={[styles.scaleBadge, { borderColor: colors.primary, backgroundColor: colors.accent }]}>
            <Text style={[styles.scaleValue, { color: colors.primary }]}>{shownThickness}px</Text>
          </View>
        </View>
        <View style={[styles.thicknessPreview, { height: shownThickness, backgroundColor: colors.primary }]} />
        <TouchSlider
          style={{ width: '100%', height: 48 }}
          accessibilityLabel="Border thickness"
          accessibilityValue={{ min: BORDER_THICKNESS_MIN, max: BORDER_THICKNESS_MAX, now: shownThickness, text: `${shownThickness} pixels` }}
          minimumValue={BORDER_THICKNESS_MIN}
          maximumValue={BORDER_THICKNESS_MAX}
          step={1}
          value={effectiveBorderThickness(settings.borderStyle, settings.borderThickness)}
          disabled={disabled}
          onDraftValueChange={(next) => setThicknessDraft(Math.round(next))}
          onSlidingComplete={(next) => { setThicknessDraft(null); update({ borderThickness: Math.round(next) }); }}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.mutedForeground}
          thumbTintColor={colors.primary}
        />
        <View style={styles.levelHeading}>
          <Text style={[styles.optionMeta, { color: colors.mutedForeground }]}>{BORDER_THICKNESS_MIN}px</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Use style default thickness" disabled={disabled}
            onPress={() => update({ borderThickness: null })}>
            <Text style={[styles.optionMeta, { color: colors.primary }]}>Style default</Text>
          </Pressable>
          <Text style={[styles.optionMeta, { color: colors.mutedForeground }]}>{BORDER_THICKNESS_MAX}px</Text>
        </View>
      </View>

      <View style={styles.settingRow}>
        <View style={styles.settingCopy}>
          <Text style={[styles.label, { color: colors.foreground }]}>Wandering frame pattern</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            {!texturedSelected
              ? 'Choose a patterned frame (Puzzled, Paws, Trans) to set its pattern in motion.'
              : animationUnlocked ? 'Let the pattern drift around the frame.' : `Earn guild rank ${ANIMATED_BORDER_LEVEL} to unlock.`}
          </Text>
        </View>
        <SettingSwitch label="Wander frame pattern" value={settings.scrollBorder}
          disabled={scrollSwitchDisabled}
          onValueChange={(scrollBorder) => update({ scrollBorder })} />
      </View>

      {settings.scrollBorder && texturedSelected && (
        <View style={{ gap: 8, opacity: directionDisabled ? 0.55 : 1 }}>
          <Text style={[styles.label, { color: colors.foreground }]}>Direction</Text>
          <View style={styles.directionGrid}>
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
      <Text style={[styles.label, { color: colors.foreground }]}>Guild milestone notes</Text>
      <SettingSwitch label="Minute cheer text" value={settings.minuteCheersEnabled}
        disabled={disabled} onValueChange={(minuteCheersEnabled) => update({ minuteCheersEnabled })} />
      <Text style={[styles.description, { color: colors.mutedForeground }]}>
        One note per line. A line cheers you on every active minute; the 10-minute achievement shows one too.
      </Text>
      <TextInput
        accessibilityLabel="Editable session congratulations messages"
        editable={!disabled}
        multiline
        maxLength={1_000}
        value={settings.congratsText}
        onChangeText={(congratsText) => update({ congratsText })}
        placeholder="Write one guild note per line"
        placeholderTextColor={colors.mutedForeground}
        textAlignVertical="top"
        returnKeyType="default"
        style={[styles.messageInput, {
          color: colors.foreground, borderColor: colors.input, backgroundColor: colors.background,
        }]}
      />
      {onGenerateCelebrations && (
        <Pressable accessibilityRole="button" disabled={disabled || generatingCelebrations}
          accessibilityState={{ disabled: disabled || generatingCelebrations, busy: generatingCelebrations }}
          onPress={() => {
            setGenerateError('');
            onGenerateCelebrations().catch((reason) =>
              setGenerateError(reason instanceof Error ? reason.message : 'Could not generate new cheers.'));
          }}
          style={[styles.unlockAllButton, { borderColor: colors.primary, backgroundColor: colors.background,
            opacity: disabled || generatingCelebrations ? 0.55 : 1, minHeight: 44 }]}>
          <Feather name="feather" size={16} color={colors.primary} />
          <Text style={[styles.label, { color: colors.primary }]}>
            {generatingCelebrations ? 'Writing new cheers…' : 'Generate new cheers'}
          </Text>
        </Pressable>
      )}
      {!!generateError && <Text style={[styles.error, { color: colors.destructive }]}>{generateError}</Text>}
      <Text accessibilityLiveRegion="polite" style={[styles.description, { color: colors.mutedForeground }]}>
        {generatingCelebrations ? 'The local model is writing notes…' : generatedCelebrations.length
          ? `${generatedCelebrations.length} AI notes saved. These play before your original notes, including at milestones.`
          : 'No AI notes saved for this seed. Load a local model, then tap Generate new cheers. Generation is manual.'}
      </Text>
      {generatedCelebrations.slice(0, 3).map((line, index) => (
        <Text key={`${index}-${line}`} style={[styles.description, { color: colors.foreground }]}>{line}</Text>
      ))}
      {!!error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 16, gap: 11 },
  kicker: { fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  sectionTitle: { fontSize: 16, fontWeight: '800', letterSpacing: 0.1 },
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
  textureSetting: { gap: 6, borderWidth: 1, borderRadius: 12, padding: 12 },
  scaleBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, minWidth: 58, alignItems: 'center' },
  scaleValue: { fontSize: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
  scalePreview: { height: 40, borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, overflow: 'hidden',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 6 },
  directionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  directionButton: { width: '23%', flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8,
    borderRadius: 9, borderWidth: 1 },
  directionLabel: { fontSize: 10, fontWeight: '600' },
  thicknessPreview: { borderRadius: 2, alignSelf: 'stretch' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  messageInput: { borderWidth: 1, borderRadius: 10, minHeight: 115, padding: 12, fontSize: 14, lineHeight: 20 },
  error: { fontSize: 12 },
});
