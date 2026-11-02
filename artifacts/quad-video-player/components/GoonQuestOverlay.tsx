import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  getRpgQuests, goonQuestClasses, type GoonQuestClassId, type PlayerRpgState,
  type RpgQuest,
} from '@/lib/player-rpg';
import type { SlideshowImage } from '@/lib/slideshow';

type Enemy = {
  id: string;
  uri: string;
  name: string;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  drift: number;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  pool: SlideshowImage[];
  state: PlayerRpgState;
  onSelectClass: (id: GoonQuestClassId) => void;
  onCombatProgress: (progress: { defeats?: number; spells?: number; dungeons?: number }) => void;
  onClaimQuest: (id: RpgQuest['id']) => boolean;
  onManageImages: () => void;
  onDialogue: (message: string) => void;
};

const DUNGEON_WAVES = 3;
let nextEnemyId = 0;

function createWave(pool: SlideshowImage[], wave: number): Enemy[] {
  const count = Math.min(4, 2 + wave);
  return Array.from({ length: count }, () => {
    const image = pool[Math.floor(Math.random() * pool.length)];
    return {
      id: `image-enemy-${++nextEnemyId}`,
      uri: image.uri,
      name: image.name,
      hp: wave,
      maxHp: wave,
      x: Math.floor(Math.random() * 72),
      y: Math.floor(Math.random() * 56),
      drift: 45 + Math.floor(Math.random() * 55),
    };
  });
}

function BouncingTarget({ enemy, onTap }: { enemy: Enemy; onTap: () => void }) {
  const colors = useColors();
  const drift = useRef(new Animated.Value(0)).current;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(drift, { toValue: 1, duration: 900 + enemy.drift * 8, useNativeDriver: true }),
      Animated.timing(drift, { toValue: 0, duration: 900 + enemy.drift * 8, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [drift, enemy.drift]);

  return (
    <Animated.View
      style={[
        styles.target,
        {
          left: `${enemy.x}%`,
          top: `${enemy.y}%`,
          transform: [
            { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-enemy.drift / 2, enemy.drift / 2] }) },
            { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [28, -28] }) },
            { rotate: drift.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '8deg'] }) },
          ],
        },
      ]}
    >
      <Pressable accessibilityRole="button" accessibilityLabel={`Tap ${enemy.name}, ${enemy.hp} health remaining`}
        onPress={onTap} style={[styles.targetPressable, { borderColor: colors.primary }]}>
        {!failed && <Image source={{ uri: enemy.uri }} contentFit="cover" style={styles.targetImage}
          onError={() => setFailed(true)} transition={0} />}
        <View style={[styles.hpPill, { backgroundColor: colors.secondary, borderColor: colors.primary }]}>
          <Text style={[styles.hpText, { color: colors.foreground }]}>{enemy.hp}/{enemy.maxHp}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function QuestRow({
  quest, onClaim, colors,
}: {
  quest: RpgQuest;
  onClaim: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const canClaim = !quest.claimed && quest.progress >= quest.target;
  const ratio = Math.max(0, Math.min(1, quest.progress / quest.target));
  return (
    <View style={[styles.questRow, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
      <View style={styles.questCopy}>
        <View style={styles.questTitleLine}>
          <Text style={[styles.questTitle, { color: colors.foreground }]}>{quest.title}</Text>
          {quest.weekly && <Text style={[styles.weeklyTag, { color: colors.primary }]}>WEEKLY</Text>}
        </View>
        <Text style={[styles.questDescription, { color: colors.mutedForeground }]}>{quest.description}</Text>
        <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${ratio * 100}%` }]} />
        </View>
        <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
          {Math.min(quest.progress, quest.target)} / {quest.target} {quest.unit} · {quest.rewardCoins} coins
        </Text>
      </View>
      <Pressable accessibilityRole="button"
        accessibilityLabel={quest.claimed ? `${quest.title} claimed` : `Claim ${quest.title}`}
        disabled={!canClaim}
        onPress={onClaim}
        style={[styles.claimButton, { backgroundColor: canClaim ? colors.primary : colors.card, opacity: quest.claimed ? 0.5 : 1 }]}>
        <Text style={[styles.claimText, { color: canClaim ? colors.primaryForeground : colors.mutedForeground }]}>
          {quest.claimed ? 'Done' : 'Claim'}
        </Text>
      </Pressable>
    </View>
  );
}

export default function GoonQuestOverlay({
  visible, onClose, pool, state, onSelectClass, onCombatProgress, onClaimQuest, onManageImages, onDialogue,
}: Props) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const [inDungeon, setInDungeon] = useState(false);
  const [wave, setWave] = useState(0);
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [combo, setCombo] = useState(0);
  const [skillReady, setSkillReady] = useState(true);
  const [spellReady, setSpellReady] = useState(true);
  const [dungeonMessage, setDungeonMessage] = useState('');
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const transitionHandled = useRef(false);
  const adultMode = state.adultFlavorEnabled;
  const activeClass = goonQuestClasses.find((item) => item.id === state.classId) ?? goonQuestClasses[0];
  const quests = getRpgQuests(state);

  useEffect(() => () => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    cooldownTimers.current.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!visible) return;
    onDialogue(adultMode
      ? `The after-dark guild is open. ${activeClass.name}, pick a clip, start stroking, and keep your goon session going.`
      : `The guild board is open. ${activeClass.name}, choose a moonlit run or claim your spoils.`);
  }, [activeClass.name, adultMode, onDialogue, visible]);

  useEffect(() => {
    if (!inDungeon || !enemies.length || enemies.some((enemy) => enemy.hp > 0) || transitionHandled.current) return;
    transitionHandled.current = true;
    if (wave < DUNGEON_WAVES) {
      setDungeonMessage(adultMode
        ? `Wave ${wave} down. Keep edging; the next adult pinups are coming.`
        : `Wave ${wave} quieted. The next chamber opens.`);
      onDialogue(adultMode
        ? `Wave ${wave} down. Keep stroking and stay on the edge; the next adult pinups are coming.`
        : `Wave ${wave} quieted. Ready yourself for the next chamber.`);
      transitionTimer.current = setTimeout(() => {
        const nextWave = wave + 1;
        setWave(nextWave);
        setEnemies(createWave(pool, nextWave));
        setDungeonMessage('');
        transitionHandled.current = false;
      }, 900);
    } else {
      setDungeonMessage(adultMode
        ? 'Three waves down. You kept your hand moving and saved the finish for after the final target. +20 coins'
        : 'Den cleared. +20 coins');
      setInDungeon(false);
      onCombatProgress({ dungeons: 1 });
      onDialogue(adultMode
        ? 'You cleared the horde without breaking your rhythm. Now you can let yourself come and collect the guild reward.'
        : 'Den cleared. The restless portraits are quiet, and the guild purse is yours.');
    }
  }, [adultMode, enemies, inDungeon, onCombatProgress, onDialogue, pool, wave]);

  const startDungeon = () => {
    if (!pool.length) return;
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    transitionHandled.current = false;
    setCombo(0);
    setWave(1);
    setEnemies(createWave(pool, 1));
    setInDungeon(true);
    setDungeonMessage('');
    onDialogue(adultMode
      ? 'Three waves of adult pinups are bouncing through the den. Keep stroking, edge between taps, and finish the horde before you finish yourself.'
      : 'The moonlit den stirs. Tap each portrait before it bounds away.');
  };

  const hitEnemy = (enemyId: string, damage: number, message?: string) => {
    const current = enemies;
    const target = current.find((enemy) => enemy.id === enemyId);
    if (!target || target.hp <= 0) return;
    const next = current.map((enemy) => enemy.id === enemyId
      ? { ...enemy, hp: Math.max(0, enemy.hp - damage) } : enemy);
    const defeated = target.hp <= damage ? 1 : 0;
    setEnemies(next);
    if (defeated) {
      onCombatProgress({ defeats: defeated });
      setDungeonMessage(adultMode
        ? `${target.name} vanishes in a flash of magic. +2 coins`
        : `${target.name} sent packing. +2 coins`);
      onDialogue(adultMode
        ? `${target.name} vanishes in a flash of magic. Keep your hand moving; the den is still hungry.`
        : `${target.name} sent packing.`);
    } else if (message) {
      setDungeonMessage(message);
    }
  };

  const tapTarget = (enemyId: string) => {
    setCombo((value) => value + 1);
    hitEnemy(enemyId, 1);
  };

  const startCooldown = (kind: 'skill' | 'spell') => {
    if (kind === 'skill') {
      setSkillReady(false);
      cooldownTimers.current.push(setTimeout(() => setSkillReady(true), 2_000));
    } else {
      setSpellReady(false);
      cooldownTimers.current.push(setTimeout(() => setSpellReady(true), 5_000));
    }
  };

  const useSkill = () => {
    if (!inDungeon || !skillReady) return;
    const target = enemies.find((enemy) => enemy.hp > 0);
    if (!target) return;
    startCooldown('skill');
    onCombatProgress({ spells: 1 });
    hitEnemy(target.id, activeClass.skillDamage, `${activeClass.skill}!`);
    onDialogue(adultMode
      ? `${activeClass.name} unleashes ${activeClass.skill}. The heat spikes; keep edging until the den says you're done.`
      : `${activeClass.name} uses ${activeClass.skill}.`);
  };

  const useSpell = () => {
    if (!inDungeon || !spellReady) return;
    const living = enemies.filter((enemy) => enemy.hp > 0);
    if (!living.length) return;
    startCooldown('spell');
    onCombatProgress({ spells: 1 });
    if (activeClass.areaSpell) {
      const next = enemies.map((enemy) => enemy.hp > 0
        ? { ...enemy, hp: Math.max(0, enemy.hp - activeClass.spellDamage) } : enemy);
      const defeated = living.filter((enemy) => enemy.hp <= activeClass.spellDamage).length;
      setEnemies(next);
      if (defeated) onCombatProgress({ defeats: defeated });
      setDungeonMessage(`${activeClass.spell} hits ${living.length} target${living.length === 1 ? '' : 's'}!`);
    } else {
      hitEnemy(living[0].id, activeClass.spellDamage, `${activeClass.spell}!`);
    }
    onDialogue(adultMode
      ? `${activeClass.name} casts ${activeClass.spell}. Hold your climax through the spell and keep stroking.`
      : `${activeClass.name} casts ${activeClass.spell}.`);
  };

  const close = () => {
    setInDungeon(false);
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <SafeAreaView style={[styles.panel, { backgroundColor: colors.background, borderColor: colors.border, maxWidth: width > 1000 ? 980 : 760 }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.titleLine}>
              <View style={[styles.headerMark, { backgroundColor: colors.accent, borderColor: colors.border }]}>
                <Feather name="moon" size={18} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.eyebrow, { color: colors.primary }]}>THE MOONLIT GUILD</Text>
                <Text style={[styles.title, { color: colors.foreground }]}>GOON QUEST</Text>
                <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                  Your den stays open while the streams keep rolling.
                </Text>
              </View>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close quest board" onPress={close}
              style={[styles.closeButton, { backgroundColor: colors.secondary }]}>
              <Feather name="x" size={19} color={colors.foreground} />
            </Pressable>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator>
            <View style={styles.statsLine}>
              <StatPill label="RANK" value={String(state.awardedLevel)} colors={colors} />
              <StatPill label="DEN COINS" value={String(state.coins)} colors={colors} />
              <StatPill label="HUNTED" value={String(state.totalDefeated)} colors={colors} />
              <StatPill label="BEASTFOLK" value={activeClass.name} colors={colors} />
            </View>

            <View style={styles.sectionTitleLine}>
              <View>
                <Text style={[styles.sectionKicker, { color: colors.primary }]}>YOUR CALLING</Text>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Choose your class</Text>
              </View>
              <Text style={[styles.muted, { color: colors.mutedForeground }]}>Change anytime</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.classRow}>
              {goonQuestClasses.map((item) => {
                const selected = item.id === state.classId;
                return (
                  <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected }}
                    onPress={() => {
                      onSelectClass(item.id);
                      onDialogue(`${item.name} selected. ${item.role}.`);
                    }}
                    style={[styles.classCard, {
                      backgroundColor: selected ? colors.accent : colors.secondary,
                      borderColor: selected ? colors.primary : colors.border,
                    }]}>
                    <Text style={[styles.className, { color: colors.foreground }]}>{item.name}</Text>
                    <Text style={[styles.classRole, { color: colors.mutedForeground }]}>
                      {item.id === 'guardian' ? 'Hearthguard · steady strikes'
                        : item.id === 'arcanist' ? 'Moonweaver · focused spells'
                          : item.id === 'ranger' ? 'Wildkin scout · swift aim'
                            : 'Duskrunner · quick combos'}
                    </Text>
                    <Text style={[styles.classAbility, { color: colors.primary }]}>{item.skill} / {item.spell}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.sectionTitleLine}>
              <View>
                <Text style={[styles.sectionKicker, { color: colors.primary }]}>GUILD LEDGER</Text>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Open quests</Text>
              </View>
              <Text style={[styles.muted, { color: colors.mutedForeground }]}>{quests.filter((quest) => !quest.claimed).length} to claim</Text>
            </View>
            <View style={styles.questList}>
              {quests.map((quest) => (
                <QuestRow key={quest.id} quest={quest} colors={colors}
                  onClaim={() => {
                    if (onClaimQuest(quest.id)) onDialogue(adultMode
                      ? `${quest.title} claimed. ${quest.rewardCoins} coins added. Keep stroking; the next round is waiting.`
                      : `${quest.title} claimed. ${quest.rewardCoins} coins added.`);
                  }} />
              ))}
            </View>

            <View style={[styles.dungeonCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <View style={styles.sectionTitleLine}>
                <View>
                  <Text style={[styles.sectionKicker, { color: colors.primary }]}>AFTER-HOURS HUNT</Text>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>The image den</Text>
                  <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                    {pool.length ? `${pool.length} den portraits · three restless waves` : 'Stock the den with slideshow images'}
                  </Text>
                </View>
                <Feather name="zap" size={19} color={colors.primary} />
              </View>
              {!pool.length ? (
                <Pressable onPress={onManageImages} accessibilityRole="button"
                  style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Stock the den</Text>
                </Pressable>
              ) : !inDungeon ? (
                <Pressable onPress={startDungeon} accessibilityRole="button"
                  style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
                  <Feather name="play" size={16} color={colors.primaryForeground} />
                  <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Enter the den</Text>
                </Pressable>
              ) : (
                <>
                  <View style={[styles.arena, { borderColor: colors.border, width: '100%', backgroundColor: colors.background }]}>
                    {enemies.filter((enemy) => enemy.hp > 0).map((enemy) => (
                      <BouncingTarget key={enemy.id} enemy={enemy} onTap={() => tapTarget(enemy.id)} />
                    ))}
                    {!enemies.some((enemy) => enemy.hp > 0) && (
                      <View style={styles.waveNotice}>
                        <Text style={[styles.waveNoticeText, { color: colors.foreground }]}>{dungeonMessage}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.combatInfo}>
                    <Text style={[styles.waveText, { color: colors.foreground }]}>
                      Moonlit run {wave}/{DUNGEON_WAVES} · streak {combo}
                    </Text>
                    <Text style={[styles.muted, { color: colors.mutedForeground }]}>{dungeonMessage || 'Tap a restless portrait to strike.'}</Text>
                  </View>
                  <View style={styles.skillRow}>
                    <Pressable accessibilityRole="button" disabled={!skillReady}
                      onPress={useSkill}
                      style={[styles.skillButton, { backgroundColor: colors.card, borderColor: colors.border, opacity: skillReady ? 1 : 0.45 }]}>
                      <Feather name="target" size={15} color={colors.primary} />
                      <Text style={[styles.skillText, { color: colors.foreground }]}>{activeClass.skill} · {skillReady ? 'Ready' : 'Resting'}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" disabled={!spellReady}
                      onPress={useSpell}
                      style={[styles.skillButton, { backgroundColor: colors.card, borderColor: colors.border, opacity: spellReady ? 1 : 0.45 }]}>
                      <Feather name="zap" size={15} color={colors.primary} />
                      <Text style={[styles.skillText, { color: colors.foreground }]}>{activeClass.spell} · {spellReady ? 'Ready' : 'Resting'}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={() => setInDungeon(false)}
                      style={[styles.leaveButton, { borderColor: colors.border }]}>
                      <Text style={[styles.skillText, { color: colors.mutedForeground }]}>Leave the den</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
            <Text style={[styles.footerNote, { color: colors.mutedForeground }]}>
              Keep your place by the fire: playback continues, and every reward is yours to claim here.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function StatPill({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.statPill, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.91)', justifyContent: 'center', alignItems: 'center', padding: 10 },
  panel: { width: '100%', flex: 1, maxHeight: '100%', borderWidth: 1, borderRadius: 22, overflow: 'hidden' },
  header: { minHeight: 76, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  headerMark: { width: 38, height: 38, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 8, fontWeight: '900', letterSpacing: 1.6, marginBottom: 2 },
  title: { fontSize: 15, fontWeight: '900', letterSpacing: 1.8 },
  subtitle: { fontSize: 10, marginTop: 2 },
  closeButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { padding: 14, gap: 16, paddingBottom: 30 },
  statsLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statPill: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, minWidth: 78, flexGrow: 1 },
  statLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  statValue: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  sectionTitleLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  sectionKicker: { fontSize: 8, fontWeight: '900', letterSpacing: 1.4, marginBottom: 3 },
  sectionTitle: { fontSize: 15, fontWeight: '800', letterSpacing: 0.1 },
  muted: { fontSize: 10 },
  classRow: { gap: 8, paddingVertical: 2 },
  classCard: { width: 174, minHeight: 98, borderWidth: 1, borderRadius: 15, padding: 11, justifyContent: 'space-between' },
  className: { fontSize: 13, fontWeight: '800' },
  classRole: { fontSize: 10, lineHeight: 14 },
  classAbility: { fontSize: 9, fontWeight: '700' },
  questList: { gap: 7 },
  questRow: { borderWidth: 1, borderRadius: 14, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  questCopy: { flex: 1, minWidth: 0 },
  questTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  questTitle: { fontSize: 12, fontWeight: '700' },
  weeklyTag: { fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  questDescription: { fontSize: 10, marginTop: 3 },
  progressTrack: { height: 5, borderRadius: 4, marginTop: 7, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressLabel: { fontSize: 9, marginTop: 4 },
  claimButton: { minWidth: 58, paddingHorizontal: 10, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  claimText: { fontSize: 10, fontWeight: '800' },
  dungeonCard: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 12 },
  primaryButton: { minHeight: 44, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryButtonText: { fontSize: 12, fontWeight: '800' },
  arena: { height: 248, borderWidth: 1, borderRadius: 16, overflow: 'hidden', position: 'relative', backgroundColor: '#050407' },
  target: { position: 'absolute', width: 76, height: 76 },
  targetPressable: { flex: 1, borderWidth: 2, borderRadius: 16, overflow: 'visible' },
  targetImage: { width: '100%', height: '100%', borderRadius: 14 },
  hpPill: { position: 'absolute', bottom: -7, right: -7, minWidth: 34, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', borderWidth: 1 },
  hpText: { fontSize: 9, fontWeight: '800' },
  waveNotice: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 18 },
  waveNoticeText: { textAlign: 'center', fontSize: 15, fontWeight: '800' },
  combatInfo: { gap: 4 },
  waveText: { fontSize: 12, fontWeight: '800' },
  skillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  skillButton: { minHeight: 38, paddingHorizontal: 10, borderWidth: 1, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 6 },
  skillText: { fontSize: 10, fontWeight: '700' },
  leaveButton: { minHeight: 38, paddingHorizontal: 10, borderWidth: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  footerNote: { textAlign: 'center', fontSize: 10, lineHeight: 15 },
});
