import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, BackHandler, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useOnlineSources } from '@/hooks/useOnlineSources';
import {
  getRpgQuests, goonQuestClasses, type GoonQuestClassId, type PlayerRpgState,
  type RpgQuest, type StoryQuest,
} from '@/lib/player-rpg';
import { BOSS_HEALTH_PER_SECOND, bossHealthForRemainingSeconds } from '@/lib/boss-fight';
import { analyzeVideoBpm } from '@/lib/media-bpm';
import type { SlideshowImage } from '@/lib/slideshow';
import { shouldActivateCombatTap, type CombatControlScheme } from '@/lib/input-controls';

type EnemyImage = Pick<SlideshowImage, 'uri' | 'name'> & { preview?: string };
type DungeonVideo = { id: string; uri: string; name: string };
type VideoProgress = { currentTime: number; duration: number };
type BossResult = 'victory' | 'escaped' | null;
type Enemy = {
  id: string;
  uri: string;
  name: string;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  drift: number;
  bpm: number | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  pool: SlideshowImage[];
  state: PlayerRpgState;
  onSelectClass: (id: GoonQuestClassId) => void;
  onCombatProgress: (progress: { defeats?: number; spells?: number; dungeons?: number }) => void;
  onClaimQuest: (id: RpgQuest['id']) => boolean;
  onAddStoryQuest: (quest: StoryQuest) => boolean;
  onGenerateStoryQuest: () => Promise<{ quest: StoryQuest; enemyLine: string } | null>;
  onGenerateCharacterLine: (scene: string) => Promise<string | null>;
  storytellerReady: boolean;
  storytellerBusy: boolean;
  enemyBanterEnabled: boolean;
  controlScheme: CombatControlScheme;
  onManageImages: () => void;
  onManageSources: () => void;
  onDialogue: (message: string) => void;
  videos: DungeonVideo[];
  videoIndex: number;
  videoProgress: VideoProgress;
  videoIsPlaying: boolean;
  bossVideoEnded: boolean;
  onSelectVideo: (index: number) => void;
  onBeginBossVideo: (index: number) => void;
  onEndBossVideo: () => void;
  onBpmResult: (videoId: string, result: { bpm: number | null; confidence: number; error?: string }) => void;
};

const DUNGEON_WAVES = 3;
let nextEnemyId = 0;

function createWave(pool: EnemyImage[], wave: number, bpm: number | null): Enemy[] {
  if (!pool.length) return [];
  const count = Math.min(4, 2 + wave);
  return Array.from({ length: count }, () => {
    const image = pool[Math.floor(Math.random() * pool.length)];
    return {
      id: `image-enemy-${++nextEnemyId}`,
      uri: image.preview ?? image.uri,
      name: image.name,
      hp: wave,
      maxHp: wave,
      x: Math.floor(Math.random() * 72),
      y: Math.floor(Math.random() * 56),
      drift: 45 + Math.floor(Math.random() * 55),
      bpm,
    };
  });
}

function BouncingTarget({
  enemy,
  onTap,
  controlScheme,
}: {
  enemy: Enemy;
  onTap: () => void;
  controlScheme: CombatControlScheme;
}) {
  const colors = useColors();
  const drift = useRef(new Animated.Value(0)).current;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const duration = enemy.bpm ? 30_000 / enemy.bpm : 900 + enemy.drift * 8;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(drift, { toValue: 1, duration, useNativeDriver: true }),
      Animated.timing(drift, { toValue: 0, duration, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [drift, enemy.bpm, enemy.drift]);

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
        onPress={controlScheme === 'touch' ? onTap : undefined}
        onPointerUp={controlScheme === 'spen' ? (event) => {
          if (shouldActivateCombatTap(controlScheme, event.nativeEvent.pointerType)) onTap();
        } : undefined}
        style={[styles.targetPressable, { borderColor: colors.primary }]}>
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
  visible, onClose, pool, state, onSelectClass, onCombatProgress, onClaimQuest, onManageImages, onManageSources, onDialogue,
  onAddStoryQuest, onGenerateStoryQuest, onGenerateCharacterLine, storytellerReady, storytellerBusy,
  enemyBanterEnabled, controlScheme,
  videos, videoIndex, videoProgress, videoIsPlaying, bossVideoEnded, onSelectVideo, onBeginBossVideo, onEndBossVideo,
  onBpmResult,
}: Props) {
  const colors = useColors();
  const online = useOnlineSources();
  const { width } = useWindowDimensions();
  const [inDungeon, setInDungeon] = useState(false);
  const [selectedEnemySourceId, setSelectedEnemySourceId] = useState<string | null>(null);
  const [wave, setWave] = useState(0);
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [combo, setCombo] = useState(0);
  const [skillReady, setSkillReady] = useState(true);
  const [spellReady, setSpellReady] = useState(true);
  const [dungeonMessage, setDungeonMessage] = useState('');
  const [dungeonBpm, setDungeonBpm] = useState<number | null>(null);
  const [beatResults, setBeatResults] = useState<Record<string, { bpm: number | null; confidence: number; error?: string }>>({});
  const [beatLoadingId, setBeatLoadingId] = useState<string | null>(null);
  const [manualBpmByVideoId, setManualBpmByVideoId] = useState<Record<string, number>>({});
  const manualBpmByVideoIdRef = useRef(manualBpmByVideoId);
  manualBpmByVideoIdRef.current = manualBpmByVideoId;
  const [manualBpmDraft, setManualBpmDraft] = useState('');
  const [tapCount, setTapCount] = useState(0);
  const [tempoNotice, setTempoNotice] = useState('');
  const tapSequence = useRef<{ videoId: string; times: number[] }>({ videoId: '', times: [] });
  const [bossActive, setBossActive] = useState(false);
  const [bossResult, setBossResult] = useState<BossResult>(null);
  const [bossHp, setBossHp] = useState(0);
  const [bossMaxHp, setBossMaxHp] = useState(0);
  const [bossCombo, setBossCombo] = useState(0);
  const [bossBpm, setBossBpm] = useState<number | null>(null);
  const [bossImage, setBossImage] = useState<EnemyImage | null>(null);
  const [bossMessage, setBossMessage] = useState('');
  const [storyLine, setStoryLine] = useState('');
  const [storyError, setStoryError] = useState('');
  const bossResultRef = useRef<BossResult>(null);
  const bossHpRef = useRef(0);
  const bossPulse = useRef(new Animated.Value(0)).current;
  const enemyLineBusy = useRef(false);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const transitionHandled = useRef(false);
  const enemySourceSelectionTouched = useRef(false);
  const adultMode = state.adultFlavorEnabled;
  const activeClass = goonQuestClasses.find((item) => item.id === state.classId) ?? goonQuestClasses[0];
  const quests = getRpgQuests(state);
  const enemySources = online.sources
    .filter((source) => source.kind === 'rule34' || source.kind === 'e621')
    .sort((a, b) => Number(b.dungeonEnemy === true) - Number(a.dungeonEnemy === true));
  const selectedEnemySource = enemySources.find((source) => source.id === selectedEnemySourceId);
  const selectedVideo = videos[videoIndex];
  const selectedBeatResult = selectedVideo ? beatResults[selectedVideo.id] : undefined;
  const selectedBpm = selectedBeatResult?.bpm ?? null;
  const manualBpm = selectedVideo ? manualBpmByVideoId[selectedVideo.id] ?? null : null;
  const effectiveSelectedBpm = manualBpm ?? selectedBpm;
  const draftBpm = Number.parseInt(manualBpmDraft.trim(), 10);
  const canApplyManualBpm = Number.isInteger(draftBpm) && draftBpm >= 40 && draftBpm <= 240;
  const remainingSeconds = Math.max(0, videoProgress.duration - videoProgress.currentTime);
  const bossMaxHpForVideo = bossHealthForRemainingSeconds(remainingSeconds);
  const selectedSourceResult = selectedEnemySource ? online.results[selectedEnemySource.id] : undefined;
  const enemyPool: EnemyImage[] = selectedEnemySource
    ? selectedSourceResult?.images ?? []
    : pool;

  useEffect(() => {
    const videoId = selectedVideo?.id ?? '';
    tapSequence.current = { videoId, times: [] };
    setTapCount(0);
    setTempoNotice('');
    setManualBpmDraft(videoId ? String(manualBpmByVideoIdRef.current[videoId] ?? '') : '');
  }, [selectedVideo?.id]);

  const saveManualBpm = (bpm: number) => {
    if (!selectedVideo) return;
    setManualBpmByVideoId((current) => ({ ...current, [selectedVideo.id]: bpm }));
    setManualBpmDraft(String(bpm));
    setTempoNotice(`Manual tempo set to ${bpm} BPM.`);
    onBpmResult(selectedVideo.id, { bpm, confidence: 1 });
  };

  const applyManualBpm = () => {
    const bpm = Number.parseInt(manualBpmDraft.trim(), 10);
    if (!Number.isInteger(bpm) || bpm < 40 || bpm > 240) {
      setTempoNotice('Enter a whole BPM from 40 to 240.');
      return;
    }
    saveManualBpm(bpm);
  };

  const tapToEstimateBpm = () => {
    if (!selectedVideo) return;
    const now = Date.now();
    const previous = tapSequence.current;
    let times = previous.videoId === selectedVideo.id ? previous.times : [];
    const gap = times.length ? now - times[times.length - 1] : 0;
    if (gap > 2_500 || (gap > 0 && (gap < 250 || gap > 1_500))) times = [];
    times = [...times, now].slice(-9);
    tapSequence.current = { videoId: selectedVideo.id, times };
    setTapCount(times.length);
    if (times.length < 4) {
      setTempoNotice(`Tap ${4 - times.length} more times to estimate the tempo.`);
      return;
    }
    const intervals = times.slice(1).map((time, index) => time - times[index]).sort((a, b) => a - b);
    const middle = Math.floor(intervals.length / 2);
    const median = intervals.length % 2
      ? intervals[middle]
      : (intervals[middle - 1] + intervals[middle]) / 2;
    const bpm = Math.round(60_000 / median);
    if (bpm < 40 || bpm > 240) {
      tapSequence.current = { videoId: selectedVideo.id, times: [now] };
      setTapCount(1);
      setTempoNotice('Keep the taps between 40 and 240 BPM. Tap three more times.');
      return;
    }
    saveManualBpm(bpm);
    setTempoNotice(`Tap estimate: ${bpm} BPM from ${times.length} taps.`);
  };

  const clearManualBpm = () => {
    if (!selectedVideo) return;
    setManualBpmByVideoId((current) => {
      const next = { ...current };
      delete next[selectedVideo.id];
      return next;
    });
    setManualBpmDraft('');
    onBpmResult(selectedVideo.id, beatResults[selectedVideo.id] ?? { bpm: null, confidence: 0 });
    setTempoNotice('Manual tempo cleared. Using analyzed BPM when available.');
  };

  const analyzeSelectedVideo = async () => {
    if (!selectedVideo || beatLoadingId) return;
    setBeatLoadingId(selectedVideo.id);
    try {
      const result = await analyzeVideoBpm(selectedVideo.uri);
      const report = { bpm: result.bpm, confidence: result.confidence };
      setBeatResults((current) => ({ ...current, [selectedVideo.id]: report }));
      onBpmResult(selectedVideo.id, report);
    } catch (error) {
      const report = {
        bpm: null,
        confidence: 0,
        error: error instanceof Error ? error.message : 'Could not analyze this video audio.',
      };
      setBeatResults((current) => ({ ...current, [selectedVideo.id]: report }));
      onBpmResult(selectedVideo.id, report);
    } finally {
      setBeatLoadingId(null);
    }
  };

  const resolveBoss = useCallback((result: Exclude<BossResult, null>) => {
    if (bossResultRef.current) return;
    bossResultRef.current = result;
    setBossResult(result);
    if (result === 'victory') {
      onCombatProgress({ defeats: 1, dungeons: 1 });
      setBossMessage('Boss defeated before the video ended.');
      onDialogue(`${activeClass.name} defeats the dungeon boss in time. The guild marks a clear.`);
    } else {
      setBossMessage('The video ended before the boss was defeated.');
      onDialogue('The dungeon boss escaped when its video ended. The rest of your session is still intact.');
    }
    onEndBossVideo();
  }, [activeClass.name, onCombatProgress, onDialogue, onEndBossVideo]);

  const finishBossView = () => {
    setBossActive(false);
    setBossResult(null);
    bossResultRef.current = null;
    onEndBossVideo();
  };

  useEffect(() => {
    if (bossActive && bossVideoEnded && !bossResultRef.current) resolveBoss('escaped');
  }, [bossActive, bossVideoEnded, resolveBoss]);

  useEffect(() => {
    if (!bossActive || bossResult || !bossBpm) {
      bossPulse.setValue(0);
      return;
    }
    const beatDuration = 60_000 / bossBpm;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(bossPulse, {
        toValue: 1, duration: Math.max(70, beatDuration * 0.18), useNativeDriver: true,
      }),
      Animated.timing(bossPulse, {
        toValue: 0, duration: Math.max(80, beatDuration * 0.82), useNativeDriver: true,
      }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [bossActive, bossBpm, bossPulse, bossResult]);

  useEffect(() => {
    if (!bossActive) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setBossActive(false);
      setBossResult(null);
      bossResultRef.current = null;
      onEndBossVideo();
      return true;
    });
    return () => subscription.remove();
  }, [bossActive, onEndBossVideo]);

  const beginBossFight = (syncToBeat: boolean) => {
    if (!selectedVideo || !videoIsPlaying || bossMaxHpForVideo <= 0 || inDungeon) return;
    bossResultRef.current = null;
    bossHpRef.current = bossMaxHpForVideo;
    setBossMaxHp(bossMaxHpForVideo);
    setBossHp(bossMaxHpForVideo);
    setBossCombo(0);
    setBossResult(null);
    setBossBpm(syncToBeat ? effectiveSelectedBpm : null);
    setBossImage(enemyPool.length ? enemyPool[Math.floor(Math.random() * enemyPool.length)] : null);
    setBossMessage(syncToBeat && effectiveSelectedBpm
      ? `Beat sync ${effectiveSelectedBpm} BPM · ${bossMaxHpForVideo} HP for ${Math.ceil(remainingSeconds)}s remaining`
      : `Boss health scales with ${Math.ceil(remainingSeconds)}s of video time remaining.`);
    setBossActive(true);
    onBeginBossVideo(videoIndex);
    onDialogue(syncToBeat && effectiveSelectedBpm
      ? `The boss is tuned to ${effectiveSelectedBpm} beats per minute. Strike in time and use your skills before the video ends.`
      : 'A dungeon boss fills the screen. Defeat it before the video ends.');
  };

  const damageBoss = (damage: number, message: string) => {
    if (!bossActive || bossVideoEnded || bossResultRef.current) return;
    const nextHp = Math.max(0, bossHpRef.current - damage);
    bossHpRef.current = nextHp;
    setBossHp(nextHp);
    setBossMessage(message);
    if (nextHp === 0) resolveBoss('victory');
  };

  const tapBoss = () => {
    const nextCombo = bossCombo + 1;
    setBossCombo(nextCombo);
    damageBoss(1 + Math.min(2, Math.floor(nextCombo / 18)), `Strike landed · combo ${nextCombo}`);
  };

  useEffect(() => {
    if (!visible || !online.loaded || enemySourceSelectionTouched.current) return;
    enemySourceSelectionTouched.current = true;
    const dedicated = online.sources.find((source) =>
      source.dungeonEnemy && (source.kind === 'rule34' || source.kind === 'e621'));
    if (dedicated) setSelectedEnemySourceId(dedicated.id);
  }, [online.loaded, online.sources, visible]);

  useEffect(() => {
    if (!visible || !selectedEnemySourceId) return;
    if (online.loaded && !online.sources.some((source) =>
      source.id === selectedEnemySourceId && (source.kind === 'rule34' || source.kind === 'e621'))) {
      setSelectedEnemySourceId(null);
      return;
    }
    online.ensureLoaded(selectedEnemySourceId);
  }, [online.ensureLoaded, online.loaded, online.sources, selectedEnemySourceId, visible]);

  const chooseEnemySource = (sourceId: string | null) => {
    enemySourceSelectionTouched.current = true;
    setSelectedEnemySourceId(sourceId);
    if (sourceId) online.ensureLoaded(sourceId);
  };

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
        setEnemies(createWave(enemyPool, nextWave, dungeonBpm));
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
  }, [adultMode, dungeonBpm, enemies, enemyPool, inDungeon, onCombatProgress, onDialogue, wave]);

  const startDungeon = () => {
    if (!enemyPool.length) return;
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    transitionHandled.current = false;
    setCombo(0);
    setWave(1);
    setDungeonBpm(effectiveSelectedBpm);
    setEnemies(createWave(enemyPool, 1, effectiveSelectedBpm));
    setInDungeon(true);
    setDungeonMessage('');
    onDialogue(adultMode
      ? `Three waves of adult pinups are bouncing through the den${effectiveSelectedBpm ? ` at ${effectiveSelectedBpm} BPM` : ''}. Keep stroking, edge between taps, and finish the horde before you finish yourself.`
      : `The moonlit den stirs${effectiveSelectedBpm ? ` to ${effectiveSelectedBpm} BPM` : ''}. Tap each portrait before it bounds away.`);
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
      if (storytellerReady && enemyBanterEnabled && !enemyLineBusy.current) {
        enemyLineBusy.current = true;
        void onGenerateCharacterLine(`${target.name}, a defeated image enemy, reacts to the player's ${activeClass.name} attack.`)
          .then((line) => {
            if (line) {
              setStoryLine(line);
              onDialogue(line);
            }
          })
          .finally(() => { enemyLineBusy.current = false; });
      }
    } else if (message) {
      setDungeonMessage(message);
    }
  };

  const tapTarget = (enemyId: string) => {
    setCombo((value) => value + 1);
    hitEnemy(enemyId, 1);
  };

  const createAiQuest = async () => {
    setStoryError('');
    const generated = await onGenerateStoryQuest();
    if (!generated) {
      setStoryError('The model did not return a quest. Check its status in Storyteller AI settings.');
      return;
    }
    if (!onAddStoryQuest(generated.quest)) {
      setStoryError('Your quest journal is full. Claim a completed storyteller quest first.');
      return;
    }
    setStoryLine(generated.enemyLine);
    onDialogue(`${generated.quest.title} added to your guild ledger.`);
  };

  const askFamiliar = async () => {
    setStoryError('');
    const line = await onGenerateCharacterLine(
      `The player is exploring the guild as a ${activeClass.name}. ${state.petName} gives a brief, encouraging line.`,
    );
    if (!line) {
      setStoryError('The familiar could not answer. Check the local model status.');
      return;
    }
    setStoryLine(line);
    onDialogue(line);
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

  const useBossSkill = () => {
    if (!skillReady) return;
    startCooldown('skill');
    onCombatProgress({ spells: 1 });
    damageBoss(6 + activeClass.skillDamage * 2, `${activeClass.skill} deals heavy damage.`);
  };

  const useBossSpell = () => {
    if (!spellReady) return;
    startCooldown('spell');
    onCombatProgress({ spells: 1 });
    damageBoss(10 + activeClass.spellDamage * 3, `${activeClass.spell} crashes into the boss.`);
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
    if (bossActive) onEndBossVideo();
    setInDungeon(false);
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    onClose();
  };

  if (bossActive) {
    const bossHealthRatio = bossMaxHp > 0 ? Math.max(0, bossHp / bossMaxHp) : 0;
    return (
      <View style={styles.bossLayer}>
        <View style={styles.bossScrim}>
          <SafeAreaView style={styles.bossSafeArea}>
            <View style={styles.bossTopBar}>
              <View style={styles.bossVideoLabel}>
                <Text style={[styles.bossKicker, { color: colors.primary }]}>VIDEO DUNGEON</Text>
                <Text numberOfLines={1} style={[styles.bossVideoName, { color: colors.foreground }]}>
                  {selectedVideo?.name ?? 'Active video'}
                </Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Leave boss fight"
                onPress={finishBossView}
                style={[styles.bossExitButton, { borderColor: colors.border, backgroundColor: 'rgba(10,8,15,0.84)' }]}>
                <Feather name="x" size={18} color={colors.foreground} />
              </Pressable>
            </View>

            <View style={styles.bossCenter}>
              <Animated.View style={[
                styles.bossPortraitFrame,
                {
                  borderColor: colors.primary,
                  transform: [{ scale: bossPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
                },
              ]}>
                <Pressable accessibilityRole="button" accessibilityLabel="Tap to attack the boss"
                  disabled={!!bossResult}
                  onPress={controlScheme === 'touch' ? tapBoss : undefined}
                  onPointerUp={controlScheme === 'spen' ? (event) => {
                    if (shouldActivateCombatTap(controlScheme, event.nativeEvent.pointerType)) tapBoss();
                  } : undefined}
                  style={styles.bossPortraitButton}>
                  {bossImage ? (
                    <Image source={{ uri: bossImage.preview ?? bossImage.uri }} contentFit="cover" style={styles.bossPortrait} />
                  ) : (
                    <View style={[styles.bossPortraitFallback, { backgroundColor: colors.secondary }]}>
                      <Feather name="shield" size={76} color={colors.primary} />
                    </View>
                  )}
                </Pressable>
              </Animated.View>
              <Text style={[styles.bossName, { color: colors.foreground }]}>
                {bossImage?.name.split(/\s+/).slice(0, 4).join(' ') || 'Moonlit Colossus'}
              </Text>
              <Text style={[styles.bossHint, { color: colors.mutedForeground }]}>
                {bossResult ? 'The encounter is over.' : 'Tap the portrait to strike'}
              </Text>
            </View>

            <View style={[styles.bossHud, { borderColor: colors.border, backgroundColor: 'rgba(10,8,15,0.92)' }]}>
              {bossResult ? (
                <View style={styles.bossResult}>
                  <Text style={[styles.bossResultTitle, { color: colors.primary }]}>
                    {bossResult === 'victory' ? 'BOSS DEFEATED' : 'BOSS ESCAPED'}
                  </Text>
                  <Text style={[styles.bossHint, { color: colors.foreground }]}>{bossMessage}</Text>
                  <Pressable accessibilityRole="button" onPress={finishBossView}
                    style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
                    <Feather name="arrow-left" size={16} color={colors.primaryForeground} />
                    <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Return to the quest board</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <View style={styles.bossHpHeader}>
                    <Text style={[styles.bossKicker, { color: colors.foreground }]}>
                      {bossHp.toLocaleString()} / {bossMaxHp.toLocaleString()} HP
                    </Text>
                    <Text style={[styles.bossKicker, { color: colors.primary }]}>
                      {Math.ceil(remainingSeconds)}s LEFT
                    </Text>
                  </View>
                  <View style={[styles.bossHpTrack, { backgroundColor: colors.card }]}>
                    <View style={[styles.bossHpFill, { backgroundColor: colors.primary, width: `${bossHealthRatio * 100}%` }]} />
                  </View>
                  <Text style={[styles.bossStatus, { color: colors.mutedForeground }]}>
                    {bossBpm ? `${bossBpm} BPM beat pulse · ` : ''}{bossMessage}
                  </Text>
                  <View style={styles.bossActionRow}>
                    <Pressable accessibilityRole="button" disabled={!!bossResult}
                      onPress={controlScheme === 'touch' ? tapBoss : undefined}
                      onPointerUp={controlScheme === 'spen' ? (event) => {
                        if (shouldActivateCombatTap(controlScheme, event.nativeEvent.pointerType)) tapBoss();
                      } : undefined}
                      style={[styles.bossAction, { borderColor: colors.primary, backgroundColor: colors.accent }]}>
                      <Feather name="target" size={15} color={colors.primary} />
                      <Text style={[styles.bossActionText, { color: colors.foreground }]}>Strike · combo {bossCombo}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" disabled={!skillReady} onPress={useBossSkill}
                      style={[styles.bossAction, { borderColor: colors.border, backgroundColor: colors.secondary, opacity: skillReady ? 1 : 0.45 }]}>
                      <Feather name="crosshair" size={15} color={colors.primary} />
                      <Text style={[styles.bossActionText, { color: colors.foreground }]}>{activeClass.skill} · {skillReady ? 'Ready' : 'Resting'}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" disabled={!spellReady} onPress={useBossSpell}
                      style={[styles.bossAction, { borderColor: colors.border, backgroundColor: colors.secondary, opacity: spellReady ? 1 : 0.45 }]}>
                      <Feather name="zap" size={15} color={colors.primary} />
                      <Text style={[styles.bossActionText, { color: colors.foreground }]}>{activeClass.spell} · {spellReady ? 'Ready' : 'Resting'}</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </SafeAreaView>
        </View>
      </View>
    );
  }

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
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
          >
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
            {storytellerReady && (
              <View style={[styles.storyCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <View style={styles.storyCardHeading}>
                  <Feather name="star" size={16} color={colors.primary} />
                  <Text style={[styles.sectionKicker, { color: colors.primary }]}>PAWSTAR’S STORY FORGE</Text>
                </View>
                <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                  Quests are written locally and use goals the game can track and reward.
                </Text>
                <View style={styles.storyActions}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Generate an AI quest"
                    disabled={storytellerBusy} onPress={() => void createAiQuest()}
                    style={[styles.storyAction, { backgroundColor: colors.primary, opacity: storytellerBusy ? 0.5 : 1 }]}>
                    <Feather name="book-open" size={14} color={colors.primaryForeground} />
                    <Text style={[styles.storyActionText, { color: colors.primaryForeground }]}>Dream a quest</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Ask Pawstar for a line"
                    disabled={storytellerBusy} onPress={() => void askFamiliar()}
                    style={[styles.storyAction, { backgroundColor: colors.card, borderColor: colors.border, opacity: storytellerBusy ? 0.5 : 1 }]}>
                    <Feather name="message-circle" size={14} color={colors.primary} />
                    <Text style={[styles.storyActionText, { color: colors.foreground }]}>Ask Pawstar</Text>
                  </Pressable>
                </View>
                {storytellerBusy && <ActivityIndicator size="small" color={colors.primary} />}
                {storyLine ? (
                  <View style={[styles.storyLineBubble, { backgroundColor: colors.card, borderColor: colors.primary }]}>
                    <Text style={[styles.storyLineText, { color: colors.foreground }]}>{storyLine}</Text>
                  </View>
                ) : null}
                {storyError ? (
                  <Text accessibilityRole="alert" style={[styles.storyError, { color: colors.destructive }]}>
                    {storyError}
                  </Text>
                ) : null}
              </View>
            )}
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
              <View>
                <Text style={[styles.sectionKicker, { color: colors.primary }]}>BEAT SYNC + BOSS</Text>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Choose a video stream</Text>
                <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                  Analyze the audio, enter a BPM, or tap along. Image enemies and the video boss use that tempo.
                </Text>
                <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                  {controlScheme === 'spen' ? 'S Pen combat taps are active.' : 'Touch combat taps are active.'}
                </Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.enemySourceRow}>
                {videos.map((video, index) => {
                  const selected = videoIndex === index;
                  return (
                    <Pressable key={`${index}-${video.id}`} accessibilityRole="button"
                      accessibilityState={{ selected }} onPress={() => onSelectVideo(index)}
                      style={[styles.sourceChip, {
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.accent : colors.card,
                      }]}>
                      <Text numberOfLines={1} style={[styles.sourceChipText, { color: colors.foreground }]}>
                        Stream {index + 1} · {video.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {selectedVideo ? (
                <View style={styles.beatStatus}>
                  <Text style={[styles.muted, { color: colors.foreground }]}>
                    {videoIsPlaying ? 'Playing' : 'Paused'} · {Math.ceil(remainingSeconds)}s left
                    {effectiveSelectedBpm
                      ? ` · ${effectiveSelectedBpm} BPM · ${manualBpm ? 'manual/tap tempo' : `${Math.round((selectedBeatResult?.confidence ?? 0) * 100)}% signal match`}`
                      : ''}
                  </Text>
                  {selectedBeatResult?.error && !manualBpm ? (
                    <Text style={[styles.muted, { color: colors.destructive }]}>{selectedBeatResult.error}</Text>
                  ) : selectedBeatResult && !selectedBpm && !manualBpm ? (
                    <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                      No steady BPM was found. You can still start an unsynced boss fight.
                    </Text>
                  ) : (
                    <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                      Boss health is {BOSS_HEALTH_PER_SECOND} HP for each second remaining.
                    </Text>
                  )}
                </View>
              ) : (
                <Text style={[styles.muted, { color: colors.mutedForeground }]}>Start a video stream to enable beat analysis and boss fights.</Text>
              )}
              {selectedVideo && (
                <View style={[styles.manualTempoPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                    Enter a BPM from 40–240 or tap along four times. Manual tempo overrides audio analysis.
                  </Text>
                  <View style={styles.manualTempoActions}>
                    <TextInput
                      accessibilityLabel="Manual video BPM"
                      value={manualBpmDraft}
                      onChangeText={(text) => setManualBpmDraft(text.replace(/\D/g, '').slice(0, 3))}
                      keyboardType="number-pad"
                      maxLength={3}
                      placeholder="BPM"
                      placeholderTextColor={colors.mutedForeground}
                      editable={!inDungeon}
                      style={[styles.manualTempoInput, { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border }]}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Set manual BPM"
                      disabled={inDungeon || !canApplyManualBpm}
                      onPress={applyManualBpm}
                      style={[styles.sourceActionButton, { borderColor: colors.primary, opacity: !inDungeon && canApplyManualBpm ? 1 : 0.45 }]}
                    >
                      <Text style={[styles.sourceActionText, { color: colors.primary }]}>Set BPM</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Tap to the beat to estimate BPM, ${tapCount} taps recorded`}
                      disabled={inDungeon}
                      onPress={tapToEstimateBpm}
                      style={[styles.sourceActionButton, { borderColor: colors.primary, opacity: !inDungeon ? 1 : 0.45 }]}
                    >
                      <Feather name="music" size={14} color={colors.primary} />
                      <Text style={[styles.sourceActionText, { color: colors.primary }]}>
                        Tap beat{tapCount ? ` · ${tapCount}` : ''}
                      </Text>
                    </Pressable>
                    {manualBpm !== null && (
                      <Pressable
                        accessibilityRole="button"
                        onPress={clearManualBpm}
                        style={[styles.sourceActionButton, { borderColor: colors.border }]}
                      >
                        <Text style={[styles.sourceActionText, { color: colors.mutedForeground }]}>Use analyzed BPM</Text>
                      </Pressable>
                    )}
                  </View>
                  {!!tempoNotice && <Text style={[styles.muted, { color: colors.primary }]}>{tempoNotice}</Text>}
                </View>
              )}
              <View style={styles.beatActions}>
                <Pressable accessibilityRole="button" disabled={!selectedVideo || !!beatLoadingId || inDungeon}
                  onPress={() => void analyzeSelectedVideo()}
                  style={[styles.sourceActionButton, { borderColor: colors.primary, opacity: !selectedVideo || beatLoadingId || inDungeon ? 0.5 : 1 }]}>
                  {beatLoadingId === selectedVideo?.id
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <Feather name="activity" size={14} color={colors.primary} />}
                  <Text style={[styles.sourceActionText, { color: colors.primary }]}>
                    {beatLoadingId === selectedVideo?.id ? 'Analyzing audio' : 'Analyze BPM'}
                  </Text>
                </Pressable>
                <Pressable accessibilityRole="button"
                  disabled={!selectedVideo || !videoIsPlaying || bossMaxHpForVideo <= 0 || !effectiveSelectedBpm || inDungeon}
                  onPress={() => beginBossFight(true)}
                  style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: selectedVideo && videoIsPlaying && bossMaxHpForVideo > 0 && effectiveSelectedBpm && !inDungeon ? 1 : 0.45 }]}>
                  <Feather name="zap" size={15} color={colors.primaryForeground} />
                  <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Beat-synced boss</Text>
                </Pressable>
                <Pressable accessibilityRole="button"
                  disabled={!selectedVideo || !videoIsPlaying || bossMaxHpForVideo <= 0 || inDungeon}
                  onPress={() => beginBossFight(false)}
                  style={[styles.sourceActionButton, { borderColor: colors.border, opacity: selectedVideo && videoIsPlaying && bossMaxHpForVideo > 0 && !inDungeon ? 1 : 0.45 }]}>
                  <Text style={[styles.sourceActionText, { color: colors.foreground }]}>Boss without beat sync</Text>
                </Pressable>
              </View>
              {!!selectedVideo && !videoIsPlaying && (
                <Text style={[styles.muted, { color: colors.mutedForeground }]}>Play this stream first. Boss fights use its remaining playback time.</Text>
              )}
              {!!selectedVideo && videoIsPlaying && videoProgress.duration > 0 && bossMaxHpForVideo <= 0 && (
                <Text style={[styles.muted, { color: colors.mutedForeground }]}>At least 15 seconds must remain to start a fair boss fight.</Text>
              )}
            </View>

            <View style={[styles.dungeonCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <View style={styles.sectionTitleLine}>
                <View>
                  <Text style={[styles.sectionKicker, { color: colors.primary }]}>AFTER-HOURS HUNT</Text>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>The image den</Text>
                  <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                    {enemyPool.length
                      ? `${enemyPool.length} images ready · three restless waves`
                      : 'Choose a local pool or load a tag search'}
                  </Text>
                </View>
                <Feather name="zap" size={19} color={colors.primary} />
              </View>
              <View style={styles.enemySourceBlock}>
                <View style={styles.sourceHeader}>
                  <Text style={[styles.muted, { color: colors.foreground }]}>Enemy image source</Text>
                  <Pressable accessibilityRole="button" disabled={inDungeon} onPress={onManageSources}
                    style={[styles.sourceActionButton, { borderColor: colors.primary, opacity: inDungeon ? 0.45 : 1 }]}>
                    <Text style={[styles.sourceActionText, { color: colors.primary }]}>Configure tags</Text>
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.enemySourceRow}>
                  <Pressable accessibilityRole="button" disabled={inDungeon}
                    accessibilityState={{ selected: selectedEnemySourceId === null }}
                    onPress={() => chooseEnemySource(null)}
                    style={[styles.sourceChip, {
                      borderColor: selectedEnemySourceId === null ? colors.primary : colors.border,
                      backgroundColor: selectedEnemySourceId === null ? colors.accent : colors.card,
                      opacity: inDungeon ? 0.55 : 1,
                    }]}>
                    <Text numberOfLines={1} style={[styles.sourceChipText, { color: colors.foreground }]}>
                      Slideshow · {pool.length}
                    </Text>
                  </Pressable>
                  {enemySources.map((source) => {
                    const selected = selectedEnemySourceId === source.id;
                    const provider = source.kind === 'rule34' ? 'Rule34' : 'e621';
                    const sourceLabel = `${source.dungeonEnemy ? 'Enemy' : 'Search'} · ${provider} · ${source.name}`;
                    const imageCount = online.results[source.id]?.images.length ?? 0;
                    return (
                      <Pressable key={source.id} accessibilityRole="button" disabled={inDungeon}
                        accessibilityLabel={`Use ${source.name} as dungeon enemy images`}
                        accessibilityState={{ selected }}
                        onPress={() => chooseEnemySource(source.id)}
                        style={[styles.sourceChip, {
                          borderColor: selected ? colors.primary : colors.border,
                          backgroundColor: selected ? colors.accent : colors.card,
                          opacity: inDungeon ? 0.55 : 1,
                        }]}>
                        <Text numberOfLines={1} style={[styles.sourceChipText, { color: colors.foreground }]}>
                          {sourceLabel} · {imageCount}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                {selectedEnemySource ? (
                  <View style={styles.sourceStatus}>
                    <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                      {selectedEnemySource.kind === 'rule34' ? 'Rule34.xxx' : 'e621.net'}
                      {' · Tags: '}{selectedEnemySource.tags || '(all)'}
                      {selectedEnemySource.excludeTags ? ` · Avoid: ${selectedEnemySource.excludeTags}` : ''}
                      {selectedEnemySource.safeOnly ? ' · safe-rated only' : ' · all ratings'}
                    </Text>
                    <View style={styles.sourceActions}>
                      {selectedSourceResult?.loading && <ActivityIndicator size="small" color={colors.primary} />}
                      <Pressable accessibilityRole="button" disabled={inDungeon || selectedSourceResult?.loading}
                        onPress={() => void online.refresh(selectedEnemySource.id)}
                        style={[styles.sourceActionButton, { borderColor: colors.border, opacity: selectedSourceResult?.loading ? 0.5 : 1 }]}>
                        <Text style={[styles.sourceActionText, { color: colors.foreground }]}>
                          {selectedSourceResult?.error ? 'Retry tags' : 'Refresh tags'}
                        </Text>
                      </Pressable>
                      {selectedSourceResult?.hasMore && (
                        <Pressable accessibilityRole="button" disabled={inDungeon || selectedSourceResult.loading}
                          onPress={() => void online.refresh(selectedEnemySource.id, true)}
                          style={[styles.sourceActionButton, { borderColor: colors.border, opacity: selectedSourceResult.loading ? 0.5 : 1 }]}>
                          <Text style={[styles.sourceActionText, { color: colors.foreground }]}>Load more</Text>
                        </Pressable>
                      )}
                    </View>
                    {!!selectedSourceResult?.error && (
                      <Text style={[styles.muted, { color: colors.destructive }]}>{selectedSourceResult.error}</Text>
                    )}
                    {selectedSourceResult?.loaded && !selectedSourceResult.images.length && !selectedSourceResult.hasMore && (
                      <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                        No usable images found. Adjust the tags or load another page.
                      </Text>
                    )}
                  </View>
                ) : (
                  <View style={styles.sourceStatus}>
                    <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                      Use the slideshow pool, choose any saved Rule34/e621 search, or mark a dedicated enemy search in Online media sources.
                    </Text>
                    {!pool.length && (
                      <Pressable accessibilityRole="button" disabled={inDungeon} onPress={onManageImages}
                        style={[styles.sourceActionButton, { borderColor: colors.primary }]}>
                        <Text style={[styles.sourceActionText, { color: colors.primary }]}>Add slideshow images</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
              {!inDungeon ? (
                <Pressable onPress={startDungeon} accessibilityRole="button" disabled={!enemyPool.length}
                  style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: enemyPool.length ? 1 : 0.45 }]}>
                  <Feather name="play" size={16} color={colors.primaryForeground} />
                  <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                    {enemyPool.length ? 'Enter the den' : 'Waiting for enemy images'}
                  </Text>
                </Pressable>
              ) : (
                <>
                  <View style={[styles.arena, { borderColor: colors.border, width: '100%', backgroundColor: colors.background }]}>
                    {enemies.filter((enemy) => enemy.hp > 0).map((enemy) => (
                      <BouncingTarget key={enemy.id} enemy={enemy} onTap={() => tapTarget(enemy.id)}
                        controlScheme={controlScheme} />
                    ))}
                    {!enemies.some((enemy) => enemy.hp > 0) && (
                      <View style={styles.waveNotice}>
                        <Text style={[styles.waveNoticeText, { color: colors.foreground }]}>{dungeonMessage}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.combatInfo}>
                    <Text style={[styles.waveText, { color: colors.foreground }]}>
                      Moonlit run {wave}/{DUNGEON_WAVES} · streak {combo}{dungeonBpm ? ` · ${dungeonBpm} BPM` : ''}
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
  enemySourceBlock: { gap: 8 },
  sourceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  enemySourceRow: { gap: 8, paddingVertical: 2 },
  sourceChip: { maxWidth: 260, minHeight: 36, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, justifyContent: 'center' },
  sourceChipText: { fontSize: 10, fontWeight: '700' },
  sourceStatus: { gap: 7 },
  sourceActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  sourceActionButton: { minHeight: 34, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  sourceActionText: { fontSize: 10, fontWeight: '700' },
  beatStatus: { gap: 4 },
  beatActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  manualTempoPanel: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 10, gap: 8 },
  manualTempoActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  manualTempoInput: { width: 72, minHeight: 36, borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, paddingHorizontal: 9, textAlign: 'center', fontSize: 13, fontWeight: '700' },
  classCard: { width: 174, minHeight: 98, borderWidth: 1, borderRadius: 15, padding: 11, justifyContent: 'space-between' },
  className: { fontSize: 13, fontWeight: '800' },
  classRole: { fontSize: 10, lineHeight: 14 },
  classAbility: { fontSize: 9, fontWeight: '700' },
  questList: { gap: 7 },
  storyCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 9, marginBottom: 12 },
  storyCardHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  storyActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  storyAction: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderRadius: 8,
  },
  storyActionText: { fontSize: 11, fontWeight: '800' },
  storyLineBubble: { borderWidth: 1, borderRadius: 9, padding: 10 },
  storyLineText: { fontSize: 12, lineHeight: 18 },
  storyError: { fontSize: 11, lineHeight: 16 },
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
  bossLayer: { ...StyleSheet.absoluteFill, zIndex: 100, elevation: 100 },
  bossScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.12)' },
  bossSafeArea: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 8 },
  bossTopBar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  bossVideoLabel: { flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(10,8,15,0.84)' },
  bossKicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  bossVideoName: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  bossExitButton: { width: 40, height: 40, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bossCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  bossPortraitFrame: {
    width: 252, height: 252, borderWidth: 3, borderRadius: 126, padding: 7,
    backgroundColor: 'rgba(10,8,15,0.76)', elevation: 12,
  },
  bossPortraitButton: { flex: 1, overflow: 'hidden', borderRadius: 120 },
  bossPortrait: { width: '100%', height: '100%' },
  bossPortraitFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bossName: { fontSize: 18, fontWeight: '900', marginTop: 15, textAlign: 'center' },
  bossHint: { fontSize: 11, textAlign: 'center', lineHeight: 16 },
  bossHud: { borderWidth: 1, borderRadius: 16, padding: 13, gap: 9 },
  bossHpHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bossHpTrack: { height: 10, borderRadius: 6, overflow: 'hidden' },
  bossHpFill: { height: '100%', borderRadius: 6 },
  bossStatus: { fontSize: 10, lineHeight: 14 },
  bossActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  bossAction: { minHeight: 42, paddingHorizontal: 10, borderWidth: 1, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  bossActionText: { fontSize: 10, fontWeight: '800' },
  bossResult: { alignItems: 'center', gap: 9 },
  bossResultTitle: { fontSize: 15, fontWeight: '900', letterSpacing: 1.3 },
});
