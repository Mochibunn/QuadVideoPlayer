import { Feather } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { MAX_STORY_PROMPT_LENGTH, type CombatPreferenceKey, type LocalStoryPreferences } from '@/lib/local-story';
import type { LocalStoryBusy } from '@/hooks/useLocalStoryModel';
import SettingSwitch from '@/components/SettingSwitch';

type Props = {
  preferences: LocalStoryPreferences;
  ready: boolean;
  modelLoaded: boolean;
  busy: LocalStoryBusy;
  loadProgress: number;
  error: string;
  testResult: string;
  onImport: () => void;
  onLoad: () => void;
  onUnload: () => void;
  onRemove: () => void;
  onPromptChange: (value: string) => void;
  onEnemyBanterChange: (enabled: boolean) => void;
  onTest: () => void;
  onCombatPreferenceChange?: (key: CombatPreferenceKey, enabled: boolean) => void;
  onAutomationPreferenceChange?: (key: 'autoQuestGeneration' | 'autoHonorGeneration' | 'autoCheerGeneration', enabled: boolean) => void;
};

const COMBAT_TOGGLES: { key: CombatPreferenceKey; label: string; detail: string; needsDirector?: boolean }[] = [
  { key: 'combatAiEnabled', label: 'AI combat director', detail: 'Picks enemy movement patterns, pace and focus about every 20 seconds. Without a model, enemies use labeled random motion.' },
  { key: 'combatSpeechEnabled', label: 'Enemy speech balloons', detail: 'Short taunts near living enemies and last words where they fall.', needsDirector: true },
  { key: 'combatProfanityEnabled', label: 'Fantasy swearing', detail: 'Lets taunts curse. Off keeps the banter clean.', needsDirector: true },
  { key: 'combatAutoTagsEnabled', label: 'Auto tag hunts', detail: 'Mid-fight, the model may add up to 3 new tags per run to the selected Rule34/e621 enemy source. Images join future spawns only; your saved search, blacklist and rating filter stay untouched.', needsDirector: true },
];

function formatModelSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Size unavailable';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

export default function LocalStorySettings({
  preferences,
  ready,
  modelLoaded,
  busy,
  loadProgress,
  error,
  testResult,
  onImport,
  onLoad,
  onUnload,
  onRemove,
  onPromptChange,
  onEnemyBanterChange,
  onTest,
  onCombatPreferenceChange,
  onAutomationPreferenceChange,
}: Props) {
  const colors = useColors();
  const working = busy !== null;

  const button = (
    label: string,
    icon: React.ComponentProps<typeof Feather>['name'],
    onPress: () => void,
    disabled: boolean,
    primary = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        {
          backgroundColor: primary ? colors.primary : colors.secondary,
          borderColor: primary ? colors.primary : colors.border,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
      ]}
    >
      {busy === 'importing' && label === 'Import GGUF model'
        ? <ActivityIndicator size="small" color={primary ? colors.primaryForeground : colors.primary} />
        : <Feather name={icon} size={15} color={primary ? colors.primaryForeground : colors.primary} />}
      <Text style={[styles.actionText, { color: primary ? colors.primaryForeground : colors.foreground }]}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
      <View style={styles.headingRow}>
        <View style={[styles.iconTile, { backgroundColor: colors.accent }]}>
          <Feather name="cpu" size={18} color={colors.primary} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.foreground }]}>Local story alchemist</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            Write companion dialogue and tracked quest stories with an on-device GGUF model.
          </Text>
        </View>
      </View>

      <View style={[styles.modelCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.modelHeading}>
          <Feather name={modelLoaded ? 'check-circle' : 'box'} size={16} color={modelLoaded ? colors.primary : colors.mutedForeground} />
          <Text style={[styles.modelTitle, { color: colors.foreground }]}>
            {modelLoaded ? 'Loaded in memory' : preferences.modelUri ? 'Imported · not loaded' : 'No model imported'}
          </Text>
        </View>
        {preferences.modelName ? (
          <Text numberOfLines={2} style={[styles.modelMeta, { color: colors.mutedForeground }]}>
            {preferences.modelName} · {formatModelSize(preferences.modelBytes)}
          </Text>
        ) : (
          <Text style={[styles.modelMeta, { color: colors.mutedForeground }]}>
            Choose a quantized GGUF file, such as a Q4 Llama-3 8B instruct build.
          </Text>
        )}
        {busy === 'loading' && (
          <View style={styles.progressRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.modelMeta, { color: colors.mutedForeground }]}>
              Loading model · {loadProgress}%
            </Text>
          </View>
        )}
        <View style={styles.buttonRow}>
          {button('Import GGUF model', 'download', onImport, !ready || working, true)}
          {modelLoaded
            ? button('Unload', 'square', onUnload, working)
            : button('Load model', 'play', onLoad, !preferences.modelUri || !ready || working)}
          {button('Remove', 'trash-2', onRemove, !preferences.modelUri || working)}
        </View>
      </View>

      <View style={[styles.notice, { borderColor: colors.border }]}>
        <Feather name="info" size={15} color={colors.primary} />
        <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
          On this MediaTek tablet, inference uses the CPU. An 8B 4-bit model can need about 5 GB for its file plus extra working memory. Loading may take a while and can add heat or interrupt video smoothness. The model and prompt stay on this device and are not included in JSON backups.
        </Text>
      </View>

      <Text style={[styles.label, { color: colors.foreground }]}>Character and world prompt</Text>
      <TextInput
        accessibilityLabel="Local storyteller system prompt"
        value={preferences.systemPrompt}
        onChangeText={onPromptChange}
        multiline
        maxLength={MAX_STORY_PROMPT_LENGTH}
        textAlignVertical="top"
        placeholder="Describe the familiar, world, and writing tone..."
        placeholderTextColor={colors.mutedForeground}
        style={[
          styles.promptInput,
          { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border },
        ]}
      />
      <Text style={[styles.counter, { color: colors.mutedForeground }]}>
        {preferences.systemPrompt.length}/{MAX_STORY_PROMPT_LENGTH}
      </Text>

      <View style={[styles.settingRow, { borderColor: colors.border }]}>
        <View style={styles.copy}>
          <Text style={[styles.label, { color: colors.foreground }]}>AI enemy reactions</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            Generate a short local-model line when an image enemy is defeated.
          </Text>
        </View>
        <SettingSwitch
          label="AI enemy reactions"
          value={preferences.enemyBanterEnabled}
          onValueChange={onEnemyBanterChange}
          disabled={!modelLoaded || working}
        />
      </View>

      <View style={[styles.combatBlock, { borderColor: colors.border }]}>
        <Text style={[styles.sectionKicker, { color: colors.primary }]}>COMBAT DIRECTOR</Text>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          The loaded model is asked for a plan at most once every 20 seconds, never while it is writing something else. Calm motion limits always apply, and the model cannot change HP, damage or rewards.
        </Text>
        {COMBAT_TOGGLES.map((toggle) => (
          <View key={toggle.key} style={[styles.settingRow, { borderColor: colors.border }]}>
            <View style={styles.copy}>
              <Text style={[styles.label, { color: colors.foreground }]}>{toggle.label}</Text>
              <Text style={[styles.description, { color: colors.mutedForeground }]}>{toggle.detail}</Text>
            </View>
            <SettingSwitch
              label={toggle.label}
              value={preferences[toggle.key]}
              onValueChange={(enabled) => onCombatPreferenceChange?.(toggle.key, enabled)}
              disabled={!onCombatPreferenceChange || (toggle.needsDirector === true && !preferences.combatAiEnabled)}
            />
          </View>
        ))}
      </View>

      <View style={[styles.combatBlock, { borderColor: colors.border }]}>
        <Text style={[styles.sectionKicker, { color: colors.primary }]}>BACKGROUND STORYTELLER</Text>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          Optional, rate-limited generation while a session is playing. These are off by default and use the same on-device model.
        </Text>
        {([
          ['autoQuestGeneration', 'Auto-forge quests', 'Keep up to two open AI quests ready.'],
          ['autoHonorGeneration', 'Auto-forge guild honors', 'Keep a small reserve of unclaimed honors.'],
          ['autoCheerGeneration', 'Auto-write cheer notes', 'Refresh cheer lines when the saved set runs low.'],
        ] as const).map(([key, label, detail]) => (
          <View key={key} style={[styles.settingRow, { borderColor: colors.border }]}>
            <View style={styles.copy}>
              <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
              <Text style={[styles.description, { color: colors.mutedForeground }]}>{detail}</Text>
            </View>
            <SettingSwitch label={label} value={preferences[key]} onValueChange={(enabled) => onAutomationPreferenceChange?.(key, enabled)}
              disabled={working || !onAutomationPreferenceChange || (!modelLoaded && !preferences[key])} />
          </View>
        ))}
      </View>

      <View style={styles.buttonRow}>
        {button('Test the character voice', 'message-circle', onTest, !modelLoaded || working)}
      </View>
      {testResult ? (
        <View style={[styles.resultBubble, { backgroundColor: colors.card, borderColor: colors.primary }]}>
          <Text style={[styles.resultLabel, { color: colors.primary }]}>PAWSTAR SAYS</Text>
          <Text style={[styles.resultText, { color: colors.foreground }]}>{testResult}</Text>
        </View>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 13, marginBottom: 14 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconTile: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 4 },
  title: { fontSize: 16, fontWeight: '800' },
  description: { fontSize: 12, lineHeight: 18 },
  modelCard: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 10 },
  modelHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modelTitle: { fontSize: 13, fontWeight: '700' },
  modelMeta: { fontSize: 11, lineHeight: 16 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderRadius: 8,
  },
  actionText: { fontSize: 12, fontWeight: '700' },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderLeftWidth: 2, paddingLeft: 10, paddingVertical: 3 },
  noticeText: { flex: 1, fontSize: 11, lineHeight: 17 },
  label: { fontSize: 13, fontWeight: '700' },
  promptInput: { minHeight: 148, borderWidth: 1, borderRadius: 9, padding: 11, fontSize: 13, lineHeight: 19 },
  counter: { fontSize: 10, textAlign: 'right', marginTop: -9 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1 },
  combatBlock: { borderTopWidth: 1, paddingTop: 12, gap: 6 },
  sectionKicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  resultBubble: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 5 },
  resultLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  resultText: { fontSize: 13, lineHeight: 19 },
  error: { fontSize: 12, lineHeight: 17 },
});
