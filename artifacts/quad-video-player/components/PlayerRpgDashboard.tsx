import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import SettingSwitch from '@/components/SettingSwitch';
import { useColors } from '@/hooks/useColors';
import {
  currentRpgStreak, getRpgQuests, nextRpgStreakReward, PET_XP_PER_LEVEL, rpgShopItems, rpgSkills,
  shopItemCost, weeklyActiveDayCount, SKILL_RANK_LIMIT,
  type PlayerRpgState, type RpgQuest, type RpgSkillId,
} from '@/lib/player-rpg';

type Props = {
  state: PlayerRpgState;
  ready: boolean;
  error: string;
  onRetry: () => void;
  onClaimQuest: (id: RpgQuest['id']) => boolean;
  onUpgradeSkill: (id: RpgSkillId) => void;
  onBuyItem: (id: string) => void;
  onEquipItem: (id: string | null) => void;
  onSetAdultFlavor: (enabled: boolean) => void;
  onRenameCompanion: (name: string) => void;
};

export default function PlayerRpgDashboard({
  state, ready, error, onRetry, onClaimQuest, onUpgradeSkill, onBuyItem, onEquipItem,
  onSetAdultFlavor, onRenameCompanion,
}: Props) {
  const colors = useColors();
  const [nameDraft, setNameDraft] = useState(state.petName);
  const quests = getRpgQuests(state);
  const streak = currentRpgStreak(state);
  const nextStreakReward = nextRpgStreakReward(state);
  const nextStreakRewardCoins = nextStreakReward
    ? Math.floor(nextStreakReward.coins * (1 + state.skills.fortune * 0.1))
    : 0;
  const petLevel = Math.floor(state.petXp / PET_XP_PER_LEVEL) + 1;
  const petLevelProgress = (state.petXp % PET_XP_PER_LEVEL) / PET_XP_PER_LEVEL;
  const disabled = !ready || !!error;
  const petAccessory = rpgShopItems.find((item) => item.id === state.equippedItemId);

  const toggleAdultFlavor = (enabled: boolean) => {
    if (!enabled) {
      onSetAdultFlavor(false);
      return;
    }
    Alert.alert(
      'After Dark rewards',
      'This reveals adult-themed cosmetic names and descriptions. It adds no explicit images or media. Confirm that you are 18 or older.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'I am 18+', onPress: () => onSetAdultFlavor(true) },
      ],
    );
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.headingCopy}>
          <Text style={[styles.kicker, { color: colors.primary }]}>MOONLIT GUILD</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Your campaign</Text>
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>
            Keep the loop rolling. Your ledger stays on this device.
          </Text>
        </View>
        <View style={[styles.coinPill, { backgroundColor: colors.accent }]}>
          <Feather name="circle" size={14} color={colors.primary} />
          <Text style={[styles.coinText, { color: colors.primary }]}>{state.coins} coins</Text>
        </View>
      </View>

      <View style={styles.streakRow}>
        <View style={[styles.streakBadge, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <Feather name="zap" size={16} color={colors.primary} />
          <View>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{streak} day{streak === 1 ? '' : 's'}</Text>
            <Text style={[styles.statCaption, { color: colors.mutedForeground }]}>den streak</Text>
          </View>
        </View>
        <View style={[styles.streakBadge, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <Feather name="award" size={16} color={colors.primary} />
          <View>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{state.bestStreak} day{state.bestStreak === 1 ? '' : 's'}</Text>
            <Text style={[styles.statCaption, { color: colors.mutedForeground }]}>longest run</Text>
          </View>
        </View>
      </View>
      <Text style={[styles.caption, { color: colors.mutedForeground, marginTop: 6 }]}>
        {nextStreakReward
          ? `Next guild purse: ${nextStreakReward.days} days · ${nextStreakRewardCoins} coins`
          : 'Every streak purse is yours'}
      </Text>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Daily den duties</Text>
        <Text style={[styles.caption, { color: colors.mutedForeground }]}>
          Spend 10 active minutes with the guild to mark a day on your streak.
        </Text>
        {quests.map((quest) => {
          const complete = quest.progress >= quest.target;
          const progressLabel = quest.unit === 'min'
            ? `${quest.progress}/${quest.target} min`
            : `${quest.progress}/${quest.target} ${quest.unit}`;
          return (
            <View key={quest.id} style={[styles.quest, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <View style={styles.questCopy}>
                <Text style={[styles.questTitle, { color: colors.foreground }]}>{quest.title}</Text>
                <Text style={[styles.caption, { color: colors.mutedForeground }]}>{quest.description}</Text>
                <View style={styles.questProgressRow}>
                  <Text style={[styles.progressText, { color: complete ? colors.primary : colors.mutedForeground }]}>
                    {progressLabel}
                  </Text>
                  <Text style={[styles.rewardText, { color: colors.primary }]}>+{quest.rewardCoins} coins</Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={quest.claimed ? `${quest.title} reward claimed` : `Claim ${quest.title} reward`}
                accessibilityState={{ disabled: disabled || quest.claimed || !complete }}
                disabled={disabled || quest.claimed || !complete}
                onPress={() => onClaimQuest(quest.id)}
                style={[
                  styles.questButton,
                  {
                    borderColor: quest.claimed || complete ? colors.primary : colors.border,
                    backgroundColor: quest.claimed ? colors.accent : complete ? colors.primary : colors.secondary,
                    opacity: disabled || (!complete && !quest.claimed) ? 0.55 : 1,
                  },
                ]}
              >
                <Feather
                  name={quest.claimed ? 'check' : complete ? 'gift' : 'clock'}
                  size={16}
                  color={quest.claimed ? colors.primary : complete ? colors.primaryForeground : colors.mutedForeground}
                />
              </Pressable>
            </View>
          );
        })}
        <Text style={[styles.caption, { color: colors.mutedForeground }]}>
          This week: {weeklyActiveDayCount(state)}/{4} nights in good company.
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Beastfolk arts</Text>
            <Text style={[styles.caption, { color: colors.mutedForeground }]}>
              {state.skillPoints} talent mark{state.skillPoints === 1 ? '' : 's'} · earned at each new rank
            </Text>
          </View>
        </View>
        {rpgSkills.map((skill) => {
          const rank = state.skills[skill.id];
          const canUpgrade = !disabled && state.skillPoints > 0 && rank < SKILL_RANK_LIMIT;
          return (
            <View key={skill.id} style={[styles.skillRow, { borderColor: colors.border }]}>
              <View style={styles.skillIcon}>
                <Feather name="git-branch" size={16} color={colors.primary} />
              </View>
              <View style={styles.skillCopy}>
                <Text style={[styles.questTitle, { color: colors.foreground }]}>{skill.name} · {rank}/{SKILL_RANK_LIMIT}</Text>
                <Text style={[styles.caption, { color: colors.mutedForeground }]}>{skill.description}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Upgrade ${skill.name}`}
                accessibilityState={{ disabled: !canUpgrade }}
                disabled={!canUpgrade}
                onPress={() => onUpgradeSkill(skill.id)}
                style={[styles.skillButton, { backgroundColor: colors.accent, opacity: canUpgrade ? 1 : 0.45 }]}
              >
                <Feather name="plus" size={18} color={colors.primary} />
              </Pressable>
            </View>
          );
        })}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Feather name="heart" size={18} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your familiar</Text>
        </View>
        <View style={[styles.petCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <View style={[styles.petMark, { backgroundColor: colors.accent }]}>
            <Feather name={petAccessory?.icon ?? 'heart'} size={23} color={colors.primary} />
          </View>
          <View style={styles.petCopy}>
            <Text style={[styles.petName, { color: colors.foreground }]}>{state.petName}</Text>
            <Text style={[styles.caption, { color: colors.mutedForeground }]}>
              Den companion · rank {petLevel}{petAccessory ? ` · ${petAccessory.name}` : ''}
            </Text>
            <View style={[styles.petTrack, { backgroundColor: colors.muted }]}>
              <View style={[styles.petProgress, { width: `${Math.round(petLevelProgress * 100)}%`, backgroundColor: colors.primary }]} />
            </View>
            <Text style={[styles.progressText, { color: colors.mutedForeground }]}>
              {state.petXp % PET_XP_PER_LEVEL}/{PET_XP_PER_LEVEL} familiar XP
            </Text>
          </View>
        </View>
        <TextInput
          key={state.petName}
          accessibilityLabel="Companion name"
          editable={!disabled}
          defaultValue={state.petName}
          maxLength={24}
          placeholder="Name your familiar"
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="done"
          onChangeText={setNameDraft}
          onEndEditing={() => onRenameCompanion(nameDraft)}
          style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>The charm counter</Text>
        <Text style={[styles.caption, { color: colors.mutedForeground }]}>
          Trade quest spoils for a little den finery.
        </Text>
        {rpgShopItems.filter((item) => !item.matureOnly || state.adultFlavorEnabled).map((item) => {
          const owned = state.ownedItemIds.includes(item.id);
          const equipped = state.equippedItemId === item.id;
          const cost = shopItemCost(state, item);
          const canBuy = !disabled && !owned && state.coins >= cost;
          return (
            <View key={item.id} style={[styles.shopRow, { borderColor: colors.border }]}>
              <View style={[styles.shopIcon, { backgroundColor: colors.accent }]}>
                <Feather name={item.icon} size={17} color={colors.primary} />
              </View>
              <View style={styles.skillCopy}>
                <Text style={[styles.questTitle, { color: colors.foreground }]}>{item.name}</Text>
                <Text style={[styles.caption, { color: colors.mutedForeground }]}>{item.description}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={owned ? `${equipped ? 'Unequip' : 'Equip'} ${item.name}` : `Buy ${item.name} for ${cost} coins`}
                accessibilityState={{ disabled: disabled || (!owned && !canBuy) }}
                disabled={disabled || (!owned && !canBuy)}
                onPress={() => owned ? onEquipItem(equipped ? null : item.id) : onBuyItem(item.id)}
                style={[
                  styles.shopButton,
                  {
                    backgroundColor: equipped ? colors.accent : owned || canBuy ? colors.primary : colors.secondary,
                    borderColor: equipped ? colors.primary : colors.border,
                    opacity: disabled || (!owned && !canBuy) ? 0.5 : 1,
                  },
                ]}
              >
                <Text style={[styles.shopButtonText, { color: equipped ? colors.primary : owned || canBuy ? colors.primaryForeground : colors.mutedForeground }]}>
                  {equipped ? 'On' : owned ? 'Equip' : `${cost}`}
                </Text>
              </Pressable>
            </View>
          );
        })}
        <View style={[styles.adultRow, { borderTopColor: colors.border }]}>
          <View style={styles.skillCopy}>
            <Text style={[styles.questTitle, { color: colors.foreground }]}>After-dark guild ledger</Text>
            <Text style={[styles.caption, { color: colors.mutedForeground }]}>
              Optional 18+ names and descriptions for cosmetic rewards only.
            </Text>
          </View>
          <SettingSwitch
            label="Show adult-themed RPG rewards"
            value={state.adultFlavorEnabled}
            disabled={disabled}
            onValueChange={toggleAdultFlavor}
          />
        </View>
      </View>

      {!!error && (
        <View style={styles.errorRow}>
          <Text style={[styles.caption, { color: colors.destructive, flex: 1 }]}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={onRetry}>
            <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 16, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headingCopy: { flex: 1, gap: 3 },
  kicker: { fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  title: { fontSize: 18, fontWeight: '900', letterSpacing: 0.2 },
  caption: { fontSize: 11, lineHeight: 16 },
  coinPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 18, paddingHorizontal: 11, paddingVertical: 8 },
  coinText: { fontSize: 11, fontWeight: '800' },
  streakRow: { flexDirection: 'row', gap: 8 },
  streakBadge: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 11, paddingHorizontal: 10 },
  statValue: { fontSize: 13, fontWeight: '800' },
  statCaption: { fontSize: 10, marginTop: 2 },
  section: { gap: 8 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '800', letterSpacing: 0.1 },
  quest: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 13, padding: 11 },
  questCopy: { flex: 1, gap: 4 },
  questTitle: { fontSize: 12, fontWeight: '700' },
  questProgressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 2 },
  progressText: { fontSize: 10, fontWeight: '700' },
  rewardText: { fontSize: 10, fontWeight: '700' },
  questButton: { width: 38, height: 38, borderWidth: 1, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  skillRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 7 },
  skillIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  skillCopy: { flex: 1, gap: 3 },
  skillButton: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  petCard: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderRadius: 15, padding: 12 },
  petMark: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  petCopy: { flex: 1, gap: 4 },
  petName: { fontSize: 14, fontWeight: '800' },
  petTrack: { height: 5, borderRadius: 4, overflow: 'hidden', marginTop: 2 },
  petProgress: { height: '100%', borderRadius: 4 },
  nameInput: { minHeight: 42, borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, fontSize: 13 },
  shopRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 13, padding: 10 },
  shopIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  shopButton: { minWidth: 48, minHeight: 34, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderWidth: 1, borderRadius: 9 },
  shopButtonText: { fontSize: 10, fontWeight: '800' },
  adultRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  retryText: { fontSize: 12, fontWeight: '700' },
});
