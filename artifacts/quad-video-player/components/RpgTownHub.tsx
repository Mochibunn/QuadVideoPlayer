import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  getRpgQuests,
  goonQuestClasses,
  rpgShopItems,
  rpgSkills,
  shopItemCost,
  SKILL_RANK_LIMIT,
  type GoonQuestClassId,
  type PlayerRpgState,
  type RpgQuest,
  type RpgSkillId,
} from '@/lib/player-rpg';

type HubArea = 'town' | 'guild' | 'store';

type Props = {
  visible: boolean;
  onClose: () => void;
  state: PlayerRpgState;
  ready: boolean;
  error: string;
  onRetry: () => void;
  onSelectClass: (id: GoonQuestClassId) => void;
  onClaimQuest: (id: RpgQuest['id']) => boolean;
  onUpgradeSkill: (id: RpgSkillId) => void;
  onBuyItem: (id: string) => void;
  onEquipItem: (id: string | null) => void;
};

const areas: { id: HubArea; label: string; icon: 'home' | 'shield' | 'shopping-bag' }[] = [
  { id: 'town', label: 'Town Hall', icon: 'home' },
  { id: 'guild', label: 'Guild Hall', icon: 'shield' },
  { id: 'store', label: 'Store', icon: 'shopping-bag' },
];

function StatCard({ label, value }: { label: string; value: string | number }) {
  const colors = useColors();
  return (
    <View style={[styles.statCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function HubAction({
  label,
  icon,
  onPress,
  disabled = false,
}: {
  label: string;
  icon: 'check' | 'arrow-up-right' | 'shopping-cart' | 'plus';
  onPress: () => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: disabled ? colors.card : colors.accent,
          borderColor: colors.border,
          opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
        },
      ]}
    >
      <Feather name={icon} size={15} color={colors.primary} />
      <Text style={[styles.actionText, { color: colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

export default function RpgTownHub({
  visible,
  onClose,
  state,
  ready,
  error,
  onRetry,
  onSelectClass,
  onClaimQuest,
  onUpgradeSkill,
  onBuyItem,
  onEquipItem,
}: Props) {
  const colors = useColors();
  const [area, setArea] = useState<HubArea>('town');
  const activeClass = goonQuestClasses.find((item) => item.id === state.classId) ?? goonQuestClasses[0];
  const quests = getRpgQuests(state);

  const renderTown = () => (
    <>
      <View style={[styles.heroCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Text style={[styles.kicker, { color: colors.primary }]}>WELCOME BACK</Text>
        <Text style={[styles.heroTitle, { color: colors.foreground }]}>Lanternkeep</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          Your streams are paused. Visit the board, tune your calling, or spend the coins you earned.
        </Text>
        <View style={styles.statGrid}>
          <StatCard label="GUILD RANK" value={state.awardedLevel} />
          <StatCard label="DEN COINS" value={state.coins} />
          <StatCard label="COMPANION" value={state.petName} />
        </View>
      </View>

      <View style={styles.sectionHeading}>
        <View>
          <Text style={[styles.kicker, { color: colors.primary }]}>YOUR CALLING</Text>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Choose a class</Text>
        </View>
        <Text style={[styles.bodySmall, { color: colors.mutedForeground }]}>Change anytime</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.classRow}>
        {goonQuestClasses.map((item) => {
          const selected = item.id === state.classId;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onSelectClass(item.id)}
              style={[
                styles.classCard,
                {
                  backgroundColor: selected ? colors.accent : colors.secondary,
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>{item.name}</Text>
              <Text style={[styles.bodySmall, { color: colors.mutedForeground }]}>{item.role}</Text>
              <Text style={[styles.ability, { color: colors.primary }]}>{item.skill} · {item.spell}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.sectionHeading}>
        <View>
          <Text style={[styles.kicker, { color: colors.primary }]}>QUEST BOARD</Text>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Available quests</Text>
        </View>
        <Text style={[styles.bodySmall, { color: colors.mutedForeground }]}>
          {quests.filter((quest) => !quest.claimed).length} active
        </Text>
      </View>
      <View style={styles.list}>
        {quests.map((quest) => {
          const canClaim = !quest.claimed && quest.progress >= quest.target;
          const ratio = Math.min(1, Math.max(0, quest.progress / quest.target));
          const title = state.adultFlavorEnabled ? quest.adultTitle : quest.title;
          return (
            <View
              key={quest.id}
              style={[styles.listCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}
            >
              <View style={styles.rowBetween}>
                <Text style={[styles.cardTitle, styles.flex, { color: colors.foreground }]}>{title}</Text>
                <Text style={[styles.reward, { color: colors.primary }]}>{quest.rewardCoins} coins</Text>
              </View>
              <Text style={[styles.bodySmall, { color: colors.mutedForeground }]}>{quest.description}</Text>
              <View style={[styles.progressTrack, { backgroundColor: colors.card }]}>
                <View style={[styles.progressFill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: colors.primary }]} />
              </View>
              <View style={styles.rowBetween}>
                <Text style={[styles.bodySmall, { color: colors.mutedForeground }]}>
                  {Math.min(quest.progress, quest.target)} / {quest.target} {quest.unit}
                  {quest.weekly ? ' · Weekly' : ''}
                </Text>
                <HubAction
                  label={quest.claimed ? 'Claimed' : canClaim ? 'Claim reward' : 'In progress'}
                  icon={quest.claimed ? 'check' : 'plus'}
                  disabled={!canClaim}
                  onPress={() => onClaimQuest(quest.id)}
                />
              </View>
            </View>
          );
        })}
      </View>
    </>
  );

  const renderGuild = () => (
    <>
      <View style={[styles.heroCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Text style={[styles.kicker, { color: colors.primary }]}>GUILD LEDGER</Text>
        <Text style={[styles.heroTitle, { color: colors.foreground }]}>{activeClass.name}</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          {activeClass.role}. Your standing grows through active sessions, quests, and dungeon clears.
        </Text>
        <View style={styles.statGrid}>
          <StatCard label="CURRENT STREAK" value={state.currentStreak} />
          <StatCard label="BEST STREAK" value={state.bestStreak} />
          <StatCard label="TOTAL VICTORIES" value={state.totalDefeated} />
          <StatCard label="DUNGEONS TODAY" value={state.dungeonsToday} />
          <StatCard label="SPELLS TODAY" value={state.spellsToday} />
          <StatCard label="SKILL POINTS" value={state.skillPoints} />
        </View>
      </View>
      <View style={styles.sectionHeading}>
        <View>
          <Text style={[styles.kicker, { color: colors.primary }]}>PASSIVE PERKS</Text>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Skill tree</Text>
        </View>
        <Text style={[styles.bodySmall, { color: colors.mutedForeground }]}>
          {state.skillPoints} available
        </Text>
      </View>
      <View style={styles.list}>
        {rpgSkills.map((skill) => {
          const rank = state.skills[skill.id];
          const capped = rank >= SKILL_RANK_LIMIT;
          return (
            <View key={skill.id} style={[styles.listCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <View style={styles.rowBetween}>
                <Text style={[styles.cardTitle, styles.flex, { color: colors.foreground }]}>{skill.name}</Text>
                <Text style={[styles.reward, { color: colors.primary }]}>Rank {rank}/{SKILL_RANK_LIMIT}</Text>
              </View>
              <Text style={[styles.bodySmall, { color: colors.mutedForeground }]}>{skill.description}</Text>
              <HubAction
                label={capped ? 'Max rank' : 'Upgrade perk'}
                icon="arrow-up-right"
                disabled={capped || state.skillPoints < 1}
                onPress={() => onUpgradeSkill(skill.id)}
              />
            </View>
          );
        })}
      </View>
    </>
  );

  const renderStore = () => (
    <>
      <View style={[styles.heroCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Text style={[styles.kicker, { color: colors.primary }]}>NIGHT MARKET</Text>
        <Text style={[styles.heroTitle, { color: colors.foreground }]}>Guild store</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          Spend quest coins on companion keepsakes and equip one at a time.
        </Text>
        <Text style={[styles.coinBalance, { color: colors.primary }]}>{state.coins} coins available</Text>
      </View>
      <View style={styles.list}>
        {rpgShopItems.map((item) => {
          const owned = state.ownedItemIds.includes(item.id);
          const equipped = state.equippedItemId === item.id;
          const adultLocked = !!item.matureOnly && !state.adultFlavorEnabled;
          const cost = shopItemCost(state, item);
          return (
            <View key={item.id} style={[styles.listCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <View style={styles.rowBetween}>
                <Text style={[styles.cardTitle, styles.flex, { color: colors.foreground }]}>{item.name}</Text>
                <Text style={[styles.reward, { color: colors.primary }]}>{owned ? 'Owned' : `${cost} coins`}</Text>
              </View>
              <Text style={[styles.bodySmall, { color: colors.mutedForeground }]}>{item.description}</Text>
              {adultLocked && (
                <Text style={[styles.bodySmall, { color: colors.mutedForeground }]}>
                  Enable adult rewards in Settings to purchase this item.
                </Text>
              )}
              <HubAction
                label={equipped ? 'Equipped' : owned ? 'Equip item' : adultLocked ? 'Locked in settings' : 'Purchase'}
                icon={equipped ? 'check' : owned ? 'arrow-up-right' : 'shopping-cart'}
                disabled={equipped || adultLocked || (!owned && state.coins < cost)}
                onPress={() => owned ? onEquipItem(item.id) : onBuyItem(item.id)}
              />
            </View>
          );
        })}
        {state.equippedItemId && (
          <HubAction label="Unequip current item" icon="check" onPress={() => onEquipItem(null)} />
        )}
      </View>
    </>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerCopy}>
            <Text style={[styles.kicker, { color: colors.primary }]}>SESSION PAUSED</Text>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Goon Quest Hub</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close RPG hub" onPress={onClose} style={styles.closeButton}>
            <Feather name="x" size={21} color={colors.foreground} />
          </Pressable>
        </View>
        <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
          {areas.map((item) => {
            const selected = area === item.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setArea(item.id)}
                style={[
                  styles.tab,
                  { backgroundColor: selected ? colors.accent : colors.card, borderColor: selected ? colors.primary : colors.border },
                ]}
              >
                <Feather name={item.icon} size={15} color={selected ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.tabLabel, { color: selected ? colors.foreground : colors.mutedForeground }]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <ScrollView
          key={area}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator
        >
          {!ready ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.body, { color: colors.mutedForeground }]}>Loading your local RPG progress…</Text>
            </View>
          ) : error ? (
            <View style={styles.loadingState}>
              <Text style={[styles.body, { color: colors.destructive }]}>{error}</Text>
              <HubAction label="Retry loading" icon="arrow-up-right" onPress={onRetry} />
            </View>
          ) : area === 'town' ? renderTown() : area === 'guild' ? renderGuild() : renderStore()}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: { minHeight: 68, paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerCopy: { gap: 2 },
  kicker: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  closeButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  tabBar: { flexDirection: 'row', gap: 8, padding: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, minHeight: 42, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  tabLabel: { fontSize: 12, fontWeight: '700' },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 30 },
  loadingState: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 12 },
  heroCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 16, gap: 8 },
  heroTitle: { fontSize: 26, fontWeight: '800' },
  body: { fontSize: 13, lineHeight: 19 },
  bodySmall: { fontSize: 12, lineHeight: 17 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  statCard: { minWidth: '31%', flexGrow: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 10, gap: 3 },
  statValue: { fontSize: 16, fontWeight: '800' },
  statLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.6 },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 4 },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginTop: 2 },
  classRow: { gap: 9, paddingRight: 8 },
  classCard: { width: 230, minHeight: 120, borderWidth: 1, borderRadius: 14, padding: 12, gap: 7 },
  cardTitle: { fontSize: 14, lineHeight: 19, fontWeight: '700' },
  ability: { fontSize: 11, fontWeight: '700', marginTop: 'auto' },
  list: { gap: 9 },
  listCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 12, gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  flex: { flex: 1 },
  reward: { fontSize: 11, fontWeight: '800' },
  progressTrack: { height: 5, borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5 },
  action: { alignSelf: 'flex-start', minHeight: 34, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  actionText: { fontSize: 11, fontWeight: '700' },
  coinBalance: { fontSize: 15, fontWeight: '800' },
});
