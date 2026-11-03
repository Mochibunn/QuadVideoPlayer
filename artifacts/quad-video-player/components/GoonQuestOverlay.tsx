import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo, ActivityIndicator, BackHandler, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useOnlineSources } from '@/hooks/useOnlineSources';
import {
  getRpgQuests, goonQuestClasses, type GoonQuestClassId, type PlayerRpgState,
  type RpgQuest, type StoryQuest,
} from '@/lib/player-rpg';
import { BOSS_HEALTH_PER_SECOND, bossHealthForRemainingSeconds } from '@/lib/boss-fight';
import {
  bossAbility, bossDefend, bossStrike, createBossState, stepBoss, type BossDefense, type BossState,
} from '@/lib/boss-mechanics';
import { applyEnemyHit, clampEnemyCount, MAX_DEN_ENEMIES, MIN_DEN_ENEMIES, planWaves } from '@/lib/combat-waves';
import {
  MAX_QUEST_BATCH, batchSummary, clampBatchCount, openStoryQuestSlots, runQuestBatch,
} from '@/lib/quest-batch';
import {
  DEFAULT_CHAT_ROLE, MAX_PINS, addGeneratedHonor, bumpLedgerCounter, claimGuildHonor, evaluateGuildHonors,
  metricLabels, prunePins, removeGeneratedHonor, togglePin, type HonorProgress, type LedgerCounterKey,
} from '@/lib/guild-ledger';
import type { ChatMessage } from '@/lib/pawstar-chat';
import { useGuildLedger } from '@/hooks/useGuildLedger';
import BossArena from '@/components/quest/BossArena';
import PawstarChat from '@/components/quest/PawstarChat';
import QuestPins, { type PinItem } from '@/components/quest/QuestPins';
import { analyzeVideoBpm } from '@/lib/media-bpm';
import type { SlideshowImage } from '@/lib/slideshow';
import CombatField, { SpeechLayer, SpritePositions } from '@/components/quest/CombatField';
import MotionMiniGame from '@/components/quest/MotionMiniGame';
import { familiarCheer, GUILD_TIPS, pickLine } from '@/lib/quest-flavor';
import { useCombatDirector } from '@/hooks/useCombatDirector';
import { combineEnemyPool } from '@/lib/combat-director';
import type { CombatAiPlan, CombatAiRequest } from '@/lib/combat-ai';
import type { CombatControlScheme } from '@/lib/input-controls';

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
  bpm: number | null;
  vanished?: boolean;
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
  /** Optional calm-motion preference; OS reduce-motion is always respected. */
  calmMotion?: boolean;
  /** True while any video in the session plays; falls back to videoIsPlaying. Boss logic keeps videoIsPlaying. */
  combatPlaybackActive?: boolean;
  /** Local AI combat director (sampled, optional). */
  combatAiEnabled?: boolean;
  combatSpeechEnabled?: boolean;
  combatAutoTagsEnabled?: boolean;
  combatProfanityEnabled?: boolean;
  onGenerateCombatPlan?: (request: CombatAiRequest) => Promise<CombatAiPlan | null>;
  /** Parent-owned BPM results; preferred over results analyzed inside the overlay. */
  videoBpmById?: Record<string, { bpm: number | null; confidence: number; error?: string }>;
  /** Shows the Pawstar chat even when the quest board is hidden. */
  chatVisible?: boolean;
  onChatClose?: () => void;
  /** True while a den run or boss fight is live; parent should lock video controls. Reset to false on exit/unmount. */
  onCombatActiveChange?: (active: boolean) => void;
  /** Local model chat; rolePrompt is the user-edited Pawstar role. */
  onGenerateChatReply?: (messages: ChatMessage[], rolePrompt?: string) => Promise<string | null>;
  /** Local model honor name/flavor; the game assigns the tracked goal. */
  onGenerateHonorIdea?: (context: { className: string; companionName: string }) => Promise<{ title: string; description: string } | null>;
  /** Latest local model error, shown in chat/honor failures. */
  storytellerError?: string;
};

let nextEnemyId = 0;

function createWave(pool: EnemyImage[], wave: number, bpm: number | null, count: number): Enemy[] {
  if (!pool.length || count <= 0) return [];
  return Array.from({ length: count }, () => {
    const image = pool[Math.floor(Math.random() * pool.length)];
    return {
      id: `image-enemy-${++nextEnemyId}`,
      uri: image.preview ?? image.uri,
      name: image.name,
      hp: wave,
      maxHp: wave,
      bpm,
    };
  });
}

function PinToggle({ pinned, disabled, onPress, label, colors }: {
  pinned: boolean; disabled: boolean; onPress: () => void; label: string; colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: pinned, disabled: disabled && !pinned }}
      accessibilityLabel={pinned ? `Unpin ${label}` : `Pin ${label} above the videos`}
      disabled={disabled && !pinned} onPress={onPress} hitSlop={6}
      style={[styles.pinButton, { borderColor: pinned ? colors.primary : colors.border, opacity: disabled && !pinned ? 0.4 : 1 }]}>
      <Feather name="map-pin" size={13} color={pinned ? colors.primary : colors.mutedForeground} />
    </Pressable>
  );
}

function QuestRow({
  quest, onClaim, colors, pinned, pinDisabled, onTogglePin,
}: {
  quest: RpgQuest;
  onClaim: () => void;
  colors: ReturnType<typeof useColors>;
  pinned: boolean;
  pinDisabled: boolean;
  onTogglePin: () => void;
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
      {!quest.claimed && (
        <PinToggle pinned={pinned} disabled={pinDisabled} onPress={onTogglePin} label={quest.title} colors={colors} />
      )}
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
  onBpmResult, calmMotion = false, combatPlaybackActive,
  combatAiEnabled = false, combatSpeechEnabled = true, combatAutoTagsEnabled = false, combatProfanityEnabled = true,
  onGenerateCombatPlan, videoBpmById, chatVisible = false, onChatClose, onCombatActiveChange,
  onGenerateChatReply, onGenerateHonorIdea, storytellerError,
}: Props) {
  const colors = useColors();
  const online = useOnlineSources();
  const { width } = useWindowDimensions();
  const [inDungeon, setInDungeon] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [arcadeOpen, setArcadeOpen] = useState(false);
  const [flavorSeed, setFlavorSeed] = useState(() => Math.floor(Date.now() / 60_000));
  const [combatPaused, setCombatPaused] = useState(false);
  const [osReduceMotion, setOsReduceMotion] = useState(false);
  const failedEnemyUris = useRef(new Set<string>());
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
  const [boss, setBoss] = useState<BossState | null>(null);
  const bossRef = useRef<BossState | null>(null);
  const bossVideoIdRef = useRef<string | null>(null);
  const [denEnemyCount, setDenEnemyCount] = useState(3);
  const [wavePlan, setWavePlan] = useState<number[]>(() => planWaves(3));
  const enemiesRef = useRef<Enemy[]>([]);
  const [batchCount, setBatchCount] = useState(1);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchNotice, setBatchNotice] = useState('');
  const batchRunning = useRef(false);
  const batchCancel = useRef(false);
  const mountedRef = useRef(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [honorBusy, setHonorBusy] = useState(false);
  const [honorNotice, setHonorNotice] = useState('');
  const [showClaimedHonors, setShowClaimedHonors] = useState(false);
  const guild = useGuildLedger();
  const updateLedger = guild.update;
  const [bossImage, setBossImage] = useState<EnemyImage | null>(null);
  const [bossMessage, setBossMessage] = useState('');
  const [storyLine, setStoryLine] = useState('');
  const [storyError, setStoryError] = useState('');
  const bossResultRef = useRef<BossResult>(null);
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
  const selectedBeatResult = selectedVideo
    ? videoBpmById?.[selectedVideo.id] ?? beatResults[selectedVideo.id] : undefined;
  const selectedBpm = selectedBeatResult?.bpm ?? null;
  const manualBpm = selectedVideo ? manualBpmByVideoId[selectedVideo.id] ?? null : null;
  const effectiveSelectedBpm = manualBpm ?? selectedBpm;
  const draftBpm = Number.parseInt(manualBpmDraft.trim(), 10);
  const canApplyManualBpm = Number.isInteger(draftBpm) && draftBpm >= 40 && draftBpm <= 240;
  const remainingSeconds = Math.max(0, videoProgress.duration - videoProgress.currentTime);
  const bossMaxHpForVideo = bossHealthForRemainingSeconds(remainingSeconds);
  const selectedSourceResult = selectedEnemySource ? online.results[selectedEnemySource.id] : undefined;
  const [runId, setRunId] = useState(0);
  const spritePositions = useRef(new SpritePositions()).current;
  const baseEnemyPool: EnemyImage[] = selectedEnemySource
    ? selectedSourceResult?.images ?? []
    : pool;
  const knownEnemyUris = useMemo(() => new Set(baseEnemyPool.flatMap((image) =>
    image.preview ? [image.uri, image.preview] : [image.uri])), [baseEnemyPool]);
  const combatVideoPlaying = combatPlaybackActive ?? videoIsPlaying;
  const combatPausedNow = combatPaused || !combatVideoPlaying;
  const calm = calmMotion || osReduceMotion;
  const director = useCombatDirector({
    runId, runActive: inDungeon, paused: combatPausedNow, enemies, wave, bpm: dungeonBpm,
    aiEnabled: combatAiEnabled, speechEnabled: combatSpeechEnabled, autoTagsEnabled: combatAutoTagsEnabled,
    profanityEnabled: combatProfanityEnabled, modelLoaded: storytellerReady, storytellerBusy,
    generatePlan: onGenerateCombatPlan, enemySource: selectedEnemySource ?? null, fetchTagImages: online.fetchEnemyTagImages,
    knownUris: knownEnemyUris,
  });
  // Transient AI images only join an online source's pool; combined pool bounded at 80.
  const enemyPool: EnemyImage[] = useMemo(() => director.extraImages.length && selectedEnemySource
    ? combineEnemyPool<EnemyImage>(baseEnemyPool, director.extraImages) : baseEnemyPool,
  [baseEnemyPool, director.extraImages, selectedEnemySource]);

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

  const bump = useCallback((key: LedgerCounterKey, amount = 1) => {
    updateLedger((current) => bumpLedgerCounter(current, key, amount));
  }, [updateLedger]);

  const resolveBoss = useCallback((result: Exclude<BossResult, null>) => {
    if (bossResultRef.current) return;
    bossResultRef.current = result;
    setBossResult(result);
    const finalBoss = bossRef.current;
    if (finalBoss) {
      bump('bossCounters', finalBoss.counters);
      bump('weakpointHits', finalBoss.weakHits);
    }
    if (result === 'victory') {
      bump('bossVictories');
      onCombatProgress({ defeats: 1, dungeons: 1 });
      setBossMessage('Boss defeated before the video ended.');
      onDialogue(`${activeClass.name} defeats the dungeon boss in time. The guild marks a clear.`);
    } else {
      setBossMessage('The video ended before the boss was defeated.');
      onDialogue('The dungeon boss escaped when its video ended. The rest of your session is still intact.');
    }
    onEndBossVideo();
  }, [activeClass.name, bump, onCombatProgress, onDialogue, onEndBossVideo]);

  const finishBossView = useCallback(() => {
    setBossActive(false);
    setBossResult(null);
    setBoss(null);
    bossRef.current = null;
    bossVideoIdRef.current = null;
    bossResultRef.current = null;
    onEndBossVideo();
  }, [onEndBossVideo]);

  const commitBoss = (next: BossState) => {
    if (bossResultRef.current) return;
    bossRef.current = next;
    setBoss(next);
    if (next.hp <= 0) resolveBoss('victory');
  };

  useEffect(() => {
    if (bossActive && bossVideoEnded && !bossResultRef.current) resolveBoss('escaped');
  }, [bossActive, bossVideoEnded, resolveBoss]);

  // The boss clock only runs while its video is actually playing.
  useEffect(() => {
    if (!bossActive || bossResult || !videoIsPlaying) return;
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const dt = now - last;
      last = now;
      const current = bossRef.current;
      if (!current || bossResultRef.current) return;
      const next = stepBoss(current, dt);
      if (next !== current) {
        bossRef.current = next;
        setBoss(next);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [bossActive, bossResult, videoIsPlaying]);

  // If the boss video leaves the parent list, end the encounter instead of pointing at a stale asset.
  const videoIdsKey = videos.map((video) => video.id).join('|');
  useEffect(() => {
    const ids = new Set(videoIdsKey ? videoIdsKey.split('|') : []);
    if (bossActive && bossVideoIdRef.current && !ids.has(bossVideoIdRef.current)) finishBossView();
    const prune = <T,>(record: Record<string, T>) => {
      const keys = Object.keys(record);
      if (keys.every((key) => ids.has(key))) return record;
      return Object.fromEntries(keys.filter((key) => ids.has(key)).map((key) => [key, record[key]])) as Record<string, T>;
    };
    setBeatResults(prune);
    setManualBpmByVideoId(prune);
    setBeatLoadingId((current) => current && !ids.has(current) ? null : current);
  }, [bossActive, finishBossView, videoIdsKey]);

  useEffect(() => {
    if (!bossActive) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      finishBossView();
      return true;
    });
    return () => subscription.remove();
  }, [bossActive, finishBossView]);

  const beginBossFight = (syncToBeat: boolean) => {
    if (!selectedVideo || !videoIsPlaying || bossMaxHpForVideo <= 0 || inDungeon) return;
    const bpm = syncToBeat ? effectiveSelectedBpm : null;
    const initial = createBossState({ maxHp: bossMaxHpForVideo, remainingSeconds, bpm });
    bossResultRef.current = null;
    bossRef.current = initial;
    bossVideoIdRef.current = selectedVideo.id;
    setBoss(initial);
    setBossResult(null);
    setBossImage(enemyPool.length ? enemyPool[Math.floor(Math.random() * enemyPool.length)] : null);
    setBossMessage('');
    setBossActive(true);
    onBeginBossVideo(videoIndex);
    onDialogue(bpm
      ? `The boss is tuned to ${bpm} beats per minute. Hit the glowing weak point on the beat, and guard or dodge its telegraphs.`
      : 'A dungeon boss fills the screen. Hit its weak point when it glows, and guard or dodge when it winds up.');
  };

  const tapBoss = () => {
    const current = bossRef.current;
    if (!current || !bossActive || bossVideoEnded || !videoIsPlaying) return;
    commitBoss(bossStrike(current).state);
  };

  const defendBoss = (defense: BossDefense) => {
    const current = bossRef.current;
    if (!current || !videoIsPlaying) return;
    commitBoss(bossDefend(current, defense));
  };

  const castBoss = (kind: 'skill' | 'spell') => {
    const current = bossRef.current;
    if (!current || !videoIsPlaying) return;
    const result = kind === 'skill'
      ? bossAbility(current, 'skill', activeClass.skillDamage, activeClass.skill)
      : bossAbility(current, 'spell', activeClass.spellDamage, activeClass.spell);
    if (!result.damage) return;
    onCombatProgress({ spells: 1 });
    bump('spellsCast');
    commitBoss(result.state);
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

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (mounted) setOsReduceMotion(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setOsReduceMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);

  const combatActiveRef = useRef(onCombatActiveChange);
  combatActiveRef.current = onCombatActiveChange;
  const combatActive = inDungeon || bossActive;
  useEffect(() => { combatActiveRef.current?.(combatActive); }, [combatActive]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      batchCancel.current = true;
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
      cooldownTimers.current.forEach(clearTimeout);
      combatActiveRef.current?.(false);
    };
  }, []);

  const updateEnemies = (next: Enemy[]) => {
    enemiesRef.current = next;
    setEnemies(next);
  };

  useEffect(() => {
    if (!visible) return;
    onDialogue(adultMode
      ? `The after-dark guild is open. ${activeClass.name}, pick a clip, start stroking, and keep your goon session going.`
      : `The guild board is open. ${activeClass.name}, choose a moonlit run or claim your spoils.`);
  }, [activeClass.name, adultMode, onDialogue, visible]);

  useEffect(() => {
    if (!inDungeon || combatPausedNow || !enemies.length || enemies.some((enemy) => enemy.hp > 0) || transitionHandled.current) return;
    transitionHandled.current = true;
    const usableLeft = enemyPool.some((image) => !failedEnemyUris.current.has(image.preview ?? image.uri));
    if (!usableLeft || enemies.every((enemy) => enemy.vanished)) {
      setInDungeon(false);
      updateEnemies([]);
      setDungeonMessage('None of the enemy images could load. The run ended without a reward; choose another source.');
      return;
    }
    if (wave < wavePlan.length) {
      setDungeonMessage(adultMode
        ? `Wave ${wave} down. Keep edging; the next adult pinups are coming.`
        : `Wave ${wave} quieted. The next chamber opens.`);
      onDialogue(adultMode
        ? `Wave ${wave} down. Keep stroking and stay on the edge; the next adult pinups are coming.`
        : `Wave ${wave} quieted. Ready yourself for the next chamber.`);
      transitionTimer.current = setTimeout(() => {
        const nextWave = wave + 1;
        const usable = enemyPool.filter((image) => !failedEnemyUris.current.has(image.preview ?? image.uri));
        if (!usable.length) {
          setInDungeon(false);
          setDungeonMessage('None of the enemy images could load. Choose another source to continue.');
          return;
        }
        setWave(nextWave);
        updateEnemies(createWave(usable, nextWave, dungeonBpm, wavePlan[nextWave - 1] ?? 1));
        setDungeonMessage('');
        transitionTimer.current = null;
        transitionHandled.current = false;
      }, 900);
    } else {
      setDungeonMessage(adultMode
        ? 'Every wave down. You kept your hand moving and saved the finish for after the final target. +20 coins'
        : 'Den cleared. +20 coins');
      setInDungeon(false);
      onCombatProgress({ dungeons: 1 });
      bump('dungeonClears');
      onDialogue(adultMode
        ? 'You cleared the horde without breaking your rhythm. Now you can let yourself come and collect the guild reward.'
        : 'Den cleared. The restless portraits are quiet, and the guild purse is yours.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adultMode, bump, combatPausedNow, dungeonBpm, enemies, enemyPool, inDungeon, onCombatProgress, onDialogue, wave, wavePlan]);

  // Pausing freezes a pending wave transition; it re-arms after resuming.
  useEffect(() => {
    if (!combatPausedNow || !transitionTimer.current) return;
    clearTimeout(transitionTimer.current);
    transitionTimer.current = null;
    transitionHandled.current = false;
  }, [combatPausedNow]);

  // Reopening the quest button mid-run brings the board back up.
  const previousVisible = useRef(visible);
  useEffect(() => {
    if (visible && !previousVisible.current && inDungeon) setBoardOpen(true);
    previousVisible.current = visible;
  }, [inDungeon, visible]);

  const startDungeon = () => {
    if (!enemyPool.length) return;
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    transitionHandled.current = false;
    failedEnemyUris.current.clear();
    setCombatPaused(false);
    setBoardOpen(false);
    setCombo(0);
    setRunId((value) => value + 1);
    spritePositions.clear();
    const plan = planWaves(denEnemyCount);
    setWavePlan(plan);
    setWave(1);
    setDungeonBpm(effectiveSelectedBpm);
    updateEnemies(createWave(enemyPool, 1, effectiveSelectedBpm, plan[0]));
    setInDungeon(true);
    setDungeonMessage('');
    onDialogue(adultMode
      ? `${plan.length === 1 ? 'A wave' : `${plan.length} waves`} of adult pinups are bouncing through the den${effectiveSelectedBpm ? ` at ${effectiveSelectedBpm} BPM` : ''}. Keep stroking, edge between taps, and finish the horde before you finish yourself.`
      : `The moonlit den stirs${effectiveSelectedBpm ? ` to ${effectiveSelectedBpm} BPM` : ''}. Tap each portrait before it bounds away.`);
  };

  const handleEnemyImageFailed = (enemyId: string, uri: string) => {
    failedEnemyUris.current.add(uri);
    updateEnemies(enemiesRef.current.map((enemy) => {
      if (enemy.id !== enemyId || enemy.hp <= 0) return enemy;
      const options = enemyPool.filter((image) => !failedEnemyUris.current.has(image.preview ?? image.uri));
      if (!options.length) return { ...enemy, hp: 0, vanished: true };
      const image = options[Math.floor(Math.random() * options.length)];
      return { ...enemy, id: `image-enemy-${++nextEnemyId}`, uri: image.preview ?? image.uri, name: image.name };
    }));
  };

  const hitEnemy = (enemyId: string, damage: number, message?: string): boolean => {
    if (combatPausedNow) return false;
    // Reads the synchronously updated ref so two taps in one frame cannot both land on a dead target.
    const hit = applyEnemyHit(enemiesRef.current, enemyId, damage);
    if (!hit) return false;
    const target = hit.defeated ?? enemiesRef.current.find((enemy) => enemy.id === enemyId)!;
    const defeated = hit.defeated ? 1 : 0;
    updateEnemies(hit.next);
    if (defeated) director.reportDefeats([target.id]);
    if (defeated) {
      onCombatProgress({ defeats: defeated });
      setDungeonMessage(adultMode
        ? `${target.name} vanishes in a flash of magic. +2 coins`
        : `${target.name} sent packing. +2 coins`);
      onDialogue(adultMode
        ? `${target.name} vanishes in a flash of magic. Keep your hand moving; the den is still hungry.`
        : `${target.name} sent packing.`);
      if (storytellerReady && enemyBanterEnabled && !(combatAiEnabled && combatSpeechEnabled) && !enemyLineBusy.current) {
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
    return true;
  };

  const tapTarget = (enemyId: string) => {
    if (combatPausedNow) return;
    if (hitEnemy(enemyId, 1)) setCombo((value) => value + 1);
  };

  const storySlots = openStoryQuestSlots(state.storyQuests);
  const batchLimit = Math.max(1, Math.min(MAX_QUEST_BATCH, storySlots));
  const effectiveBatch = clampBatchCount(batchCount, storySlots);

  const runAiQuestBatch = async () => {
    if (batchRunning.current || storytellerBusy) return;
    setStoryError('');
    setBatchNotice('');
    if (!storytellerReady) {
      setStoryError('No local model is loaded. Load a GGUF model in Settings > Local storyteller.');
      return;
    }
    if (!effectiveBatch) {
      setStoryError('Your quest journal is full. Claim a completed storyteller quest first.');
      return;
    }
    batchRunning.current = true;
    batchCancel.current = false;
    setBatchProgress({ done: 0, total: effectiveBatch });
    let lastLine = '';
    try {
      const { added, stop } = await runQuestBatch({
        count: effectiveBatch,
        generate: async () => {
          const generated = await onGenerateStoryQuest();
          if (generated) lastLine = generated.enemyLine;
          return generated;
        },
        add: (generated) => onAddStoryQuest(generated.quest),
        isCancelled: () => batchCancel.current,
        onProgress: (done, total) => { if (mountedRef.current) setBatchProgress({ done, total }); },
      });
      if (added.length) bump('questsForged', added.length);
      if (!mountedRef.current) return;
      if (lastLine && added.length) setStoryLine(lastLine);
      const summary = batchSummary(added.length, effectiveBatch, stop);
      if (stop === 'model' || stop === 'full') setStoryError(stop === 'model' && storytellerError ? `${summary} ${storytellerError}` : summary);
      else setBatchNotice(summary);
      if (added.length) onDialogue(added.length === 1
        ? `${added[0].quest.title} added to your guild ledger.`
        : `${added.length} new quests added to your guild ledger.`);
    } finally {
      batchRunning.current = false;
      if (mountedRef.current) setBatchProgress(null);
    }
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

  const useSkill = () => {
    if (!inDungeon || !skillReady || combatPausedNow) return;
    const target = enemiesRef.current.find((enemy) => enemy.hp > 0);
    if (!target) return;
    startCooldown('skill');
    onCombatProgress({ spells: 1 });
    bump('spellsCast');
    hitEnemy(target.id, activeClass.skillDamage, `${activeClass.skill}!`);
    onDialogue(adultMode
      ? `${activeClass.name} unleashes ${activeClass.skill}. The heat spikes; keep edging until the den says you're done.`
      : `${activeClass.name} uses ${activeClass.skill}.`);
  };

  const useSpell = () => {
    if (!inDungeon || !spellReady || combatPausedNow) return;
    const living = enemiesRef.current.filter((enemy) => enemy.hp > 0);
    if (!living.length) return;
    startCooldown('spell');
    onCombatProgress({ spells: 1 });
    bump('spellsCast');
    if (activeClass.areaSpell) {
      const next = enemiesRef.current.map((enemy) => enemy.hp > 0
        ? { ...enemy, hp: Math.max(0, enemy.hp - activeClass.spellDamage) } : enemy);
      const fallen = living.filter((enemy) => enemy.hp <= activeClass.spellDamage);
      const defeated = fallen.length;
      updateEnemies(next);
      if (defeated) director.reportDefeats(fallen.map((enemy) => enemy.id));
      if (defeated) onCombatProgress({ defeats: defeated });
      setDungeonMessage(`${activeClass.spell} hits ${living.length} target${living.length === 1 ? '' : 's'}!`);
    } else {
      hitEnemy(living[0].id, activeClass.spellDamage, `${activeClass.spell}!`);
    }
    onDialogue(adultMode
      ? `${activeClass.name} casts ${activeClass.spell}. Hold your climax through the spell and keep stroking.`
      : `${activeClass.name} casts ${activeClass.spell}.`);
  };

  const leaveDungeon = () => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    transitionHandled.current = false;
    setInDungeon(false);
    updateEnemies([]);
    setRunId((value) => value + 1);
    setCombatPaused(false);
    setBoardOpen(false);
  };

  // Closing the board never ends an active encounter; combat stays on the videos.
  const close = () => {
    if (bossActive) onEndBossVideo();
    setBoardOpen(false);
    onClose();
  };

  const honors = useMemo(() => evaluateGuildHonors(state, guild.ledger), [guild.ledger, state]);
  const questIdsKey = quests.map((quest) => quest.id).join('|');
  const honorIdsKey = honors.map((honor) => honor.id).join('|');
  useEffect(() => {
    if (!guild.ready || !state.dayKey) return;
    updateLedger((current) => prunePins(current, questIdsKey.split('|'), honorIdsKey.split('|')));
  }, [guild.ready, honorIdsKey, questIdsKey, state.dayKey, updateLedger]);

  const pinItems: PinItem[] = [
    ...guild.ledger.pinnedQuestIds.flatMap((id): PinItem[] => {
      const quest = quests.find((item) => item.id === id);
      return quest && !quest.claimed ? [{
        kind: 'quest', id, title: quest.title, progress: quest.progress, target: quest.target,
        done: quest.progress >= quest.target,
      }] : [];
    }),
    ...guild.ledger.pinnedHonorIds.flatMap((id): PinItem[] => {
      const honor = honors.find((item) => item.id === id);
      return honor && !honor.claimed ? [{
        kind: 'honor', id, title: honor.title, progress: honor.progress, target: honor.target, done: honor.complete,
      }] : [];
    }),
  ];

  const toggleQuestPin = (kind: 'quest' | 'honor', id: string) => {
    updateLedger((current) => togglePin(current, kind, id));
  };

  const claimHonor = (honor: HonorProgress) => {
    updateLedger((current) => claimGuildHonor(current, state, honor.id));
    onDialogue(`Guild honor earned: ${honor.title}.`);
  };

  const forgeHonor = async () => {
    setHonorNotice('');
    if (!onGenerateHonorIdea || !storytellerReady) {
      setHonorNotice('No local model is loaded. Load a GGUF model in Settings > Local storyteller to forge honors.');
      return;
    }
    if (storytellerBusy || honorBusy) {
      setHonorNotice('The model is busy. Try again when the current reply finishes.');
      return;
    }
    setHonorBusy(true);
    try {
      const idea = await onGenerateHonorIdea({ className: activeClass.name, companionName: state.petName });
      if (!mountedRef.current) return;
      if (!idea) {
        setHonorNotice(storytellerError || 'The model did not return an honor. Check its status.');
        return;
      }
      const id = `gen-honor-${Date.now().toString(36)}`;
      if (!addGeneratedHonor(guild.ledger, state, idea, id)) {
        setHonorNotice('The honor wall is full. Claim a forged honor or remove one first.');
        return;
      }
      updateLedger((current) => addGeneratedHonor(current, state, idea, id) ?? current);
      setHonorNotice(`${idea.title} joins the honor wall.`);
    } finally {
      if (mountedRef.current) setHonorBusy(false);
    }
  };

  const generatedFull = guild.ledger.generatedHonors.length >= 8
    && !guild.ledger.generatedHonors.some((honor) => guild.ledger.claimedHonorIds.includes(honor.id));

  const chatLayer = (
    <PawstarChat
      visible={chatVisible || chatOpen}
      onClose={() => { setChatOpen(false); onChatClose?.(); }}
      petName={state.petName || 'Pawstar'}
      modelReady={storytellerReady && !!onGenerateChatReply}
      modelBusy={storytellerBusy}
      modelError={storytellerError}
      rolePrompt={guild.ledger.chatRolePrompt}
      onRolePromptChange={(prompt) => updateLedger((current) => ({ ...current, chatRolePrompt: prompt }))}
      onResetRole={() => updateLedger((current) => ({ ...current, chatRolePrompt: DEFAULT_CHAT_ROLE }))}
      onSend={onGenerateChatReply}
      onExchange={() => bump('chatMessages')}
    />
  );

  if (bossActive && boss) {
    return (
      <BossArena
        boss={boss}
        result={bossResult}
        resultMessage={bossMessage}
        name={bossImage?.name.split(/\s+/).slice(0, 4).join(' ') || 'Moonlit Colossus'}
        imageUri={bossImage ? bossImage.preview ?? bossImage.uri : null}
        videoName={selectedVideo?.name ?? 'Active video'}
        remainingSeconds={remainingSeconds}
        playing={videoIsPlaying}
        calm={calm}
        controlScheme={controlScheme}
        skillName={activeClass.skill}
        spellName={activeClass.spell}
        onStrike={tapBoss}
        onDefend={defendBoss}
        onSkill={() => castBoss('skill')}
        onSpell={() => castBoss('spell')}
        onExit={finishBossView}
      />
    );
  }

  const combatLayer = inDungeon ? (
    <CombatField
      enemies={enemies}
      paused={combatPausedNow}
      calm={calm}
      controlScheme={controlScheme}
      onHit={tapTarget}
      onImageFailed={handleEnemyImageFailed}
      banner={dungeonMessage}
      hud={{
        wave, waves: wavePlan.length, combo, bpm: dungeonBpm,
        message: dungeonMessage || 'Tap a restless portrait to strike.',
        skillName: activeClass.skill, spellName: activeClass.spell, skillReady, spellReady,
        paused: combatPausedNow, videoPaused: !combatVideoPlaying, canOpenBoard: visible,
        onSkill: useSkill, onSpell: useSpell,
        onTogglePause: () => setCombatPaused((value) => !value),
        onOpenBoard: () => setBoardOpen(true),
        onLeave: leaveDungeon,
        directorLabel: director.directorLabel, directorMode: director.mode, huntLabel: director.huntLabel,
      }}
      directives={director.motions}
      speech={director.speech}
      positions={spritePositions}
    />
  ) : director.speech.some((item) => item.kind === 'defeat') ? (
    <View pointerEvents="none" style={styles.speechAfterglow}>
      <SpeechLayer speech={director.speech} positions={spritePositions} />
    </View>
  ) : null;

  return (
    <>
    {combatLayer}
    {!inDungeon && (
      <QuestPins items={pinItems} onUnpin={toggleQuestPin}
        onOpen={() => setBoardOpen(true)} />
    )}
    {chatLayer}
    <Modal visible={visible && (!inDungeon || boardOpen)} transparent animationType="fade" onRequestClose={close}>
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

            <View style={[styles.storyCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <View style={styles.storyCardHeading}>
                <Feather name="bookmark" size={15} color={colors.primary} />
                <Text style={[styles.sectionKicker, { color: colors.primary }]}>NOTICE BOARD</Text>
              </View>
              <Text style={[styles.muted, { color: colors.foreground }]}>{pickLine(GUILD_TIPS, flavorSeed)}</Text>
              <Text style={[styles.muted, { color: colors.mutedForeground, fontStyle: 'italic' }]}>
                {familiarCheer(state.petName, flavorSeed + 3)}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Pressable accessibilityRole="button" accessibilityLabel="Read another guild notice"
                  onPress={() => setFlavorSeed((value) => value + 1)}
                  style={[styles.claimButton, { backgroundColor: colors.card }]}>
                  <Text style={[styles.claimText, { color: colors.foreground }]}>Next notice</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Open Paw Parry wrist-motion arcade"
                  onPress={() => setArcadeOpen(true)}
                  style={[styles.claimButton, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.claimText, { color: colors.primaryForeground }]}>Paw Parry arcade</Text>
                </Pressable>
              </View>
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
            <View style={[styles.storyCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <View style={styles.storyCardHeading}>
                <Feather name="star" size={16} color={colors.primary} />
                <Text style={[styles.sectionKicker, { color: colors.primary }]}>PAWSTAR'S STORY FORGE</Text>
              </View>
              <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                {storytellerReady
                  ? 'Quests are written locally, one at a time, and use goals the game can track and reward.'
                  : 'Load a local GGUF model in Settings > Local storyteller to forge quests and chat with Pawstar.'}
              </Text>
              <View style={styles.batchHeader}>
                <Text style={[styles.muted, { color: colors.foreground }]}>
                  Forge {effectiveBatch || 0} quest{effectiveBatch === 1 ? '' : 's'}
                </Text>
                <Text style={[styles.muted, { color: storySlots ? colors.mutedForeground : colors.destructive }]}>
                  {storySlots ? `${storySlots} of 10 journal slots open` : 'Journal full: claim a storyteller quest'}
                </Text>
              </View>
              <StepSlider value={Math.min(batchCount, batchLimit)} min={1} max={MAX_QUEST_BATCH} limit={batchLimit}
                disabled={!!batchProgress || !storySlots} onChange={setBatchCount} label="Quest batch size" colors={colors} />
              {batchProgress && (
                <View style={styles.batchProgress}>
                  <View style={[styles.progressTrack, { backgroundColor: colors.muted, flex: 1, marginTop: 0 }]}>
                    <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${(batchProgress.done / batchProgress.total) * 100}%` }]} />
                  </View>
                  <Text style={[styles.muted, { color: colors.foreground }]}>
                    {batchProgress.done}/{batchProgress.total}{batchCancel.current ? ' · stopping' : ''}
                  </Text>
                </View>
              )}
              <View style={styles.storyActions}>
                {batchProgress ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Stop the quest batch after the current quest"
                    onPress={() => { batchCancel.current = true; setBatchNotice('Stopping after the current quest finishes...'); }}
                    style={[styles.storyAction, { backgroundColor: colors.card, borderColor: colors.destructive }]}>
                    <Feather name="square" size={14} color={colors.destructive} />
                    <Text style={[styles.storyActionText, { color: colors.foreground }]}>Stop batch</Text>
                  </Pressable>
                ) : (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Generate ${effectiveBatch} AI quests`}
                    disabled={storytellerBusy || !storytellerReady || !effectiveBatch} onPress={() => void runAiQuestBatch()}
                    style={[styles.storyAction, { backgroundColor: colors.primary, borderColor: colors.primary, opacity: storytellerBusy || !storytellerReady || !effectiveBatch ? 0.5 : 1 }]}>
                    <Feather name="book-open" size={14} color={colors.primaryForeground} />
                    <Text style={[styles.storyActionText, { color: colors.primaryForeground }]}>
                      {effectiveBatch > 1 ? `Dream ${effectiveBatch} quests` : 'Dream a quest'}
                    </Text>
                  </Pressable>
                )}
                <Pressable accessibilityRole="button" accessibilityLabel="Ask Pawstar for a line"
                  disabled={storytellerBusy || !storytellerReady || !!batchProgress} onPress={() => void askFamiliar()}
                  style={[styles.storyAction, { backgroundColor: colors.card, borderColor: colors.border, opacity: storytellerBusy || !storytellerReady || batchProgress ? 0.5 : 1 }]}>
                  <Feather name="message-circle" size={14} color={colors.primary} />
                  <Text style={[styles.storyActionText, { color: colors.foreground }]}>Ask Pawstar</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Open Pawstar chat over the videos"
                  onPress={() => { setChatOpen(true); close(); }}
                  style={[styles.storyAction, { backgroundColor: colors.card, borderColor: colors.primary }]}>
                  <Feather name="message-square" size={14} color={colors.primary} />
                  <Text style={[styles.storyActionText, { color: colors.foreground }]}>Chat over videos</Text>
                </Pressable>
              </View>
              {storytellerBusy && !batchProgress && <ActivityIndicator size="small" color={colors.primary} />}
              {!!batchNotice && <Text style={[styles.muted, { color: colors.primary }]}>{batchNotice}</Text>}
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
            <View style={styles.questList}>
              {quests.map((quest) => (
                <QuestRow key={quest.id} quest={quest} colors={colors}
                  pinned={guild.ledger.pinnedQuestIds.includes(quest.id)}
                  pinDisabled={pinItems.length >= MAX_PINS * 2 || guild.ledger.pinnedQuestIds.length >= MAX_PINS}
                  onTogglePin={() => toggleQuestPin('quest', quest.id)}
                  onClaim={() => {
                    if (onClaimQuest(quest.id)) onDialogue(adultMode
                      ? `${quest.title} claimed. ${quest.rewardCoins} coins added. Keep stroking; the next round is waiting.`
                      : `${quest.title} claimed. ${quest.rewardCoins} coins added.`);
                  }} />
              ))}
            </View>

            <View style={styles.sectionTitleLine}>
              <View>
                <Text style={[styles.sectionKicker, { color: colors.primary }]}>HONOR WALL</Text>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Guild honors</Text>
              </View>
              <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                {honors.filter((honor) => honor.claimed).length}/{honors.length} earned
              </Text>
            </View>
            <View style={styles.questList}>
              {honors.filter((honor) => showClaimedHonors || !honor.claimed)
                .sort((x, y) => Number(y.complete && !y.claimed) - Number(x.complete && !x.claimed) || y.ratio - x.ratio)
                .map((honor) => (
                  <HonorRow key={honor.id} honor={honor} colors={colors}
                    pinned={guild.ledger.pinnedHonorIds.includes(honor.id)}
                    pinDisabled={guild.ledger.pinnedHonorIds.length >= MAX_PINS}
                    onTogglePin={() => toggleQuestPin('honor', honor.id)}
                    onClaim={() => claimHonor(honor)}
                    onRemove={honor.generated ? () => updateLedger((current) => removeGeneratedHonor(current, honor.id)) : undefined} />
                ))}
            </View>
            <View style={styles.storyActions}>
              <Pressable accessibilityRole="button" onPress={() => setShowClaimedHonors((value) => !value)}
                style={[styles.sourceActionButton, { borderColor: colors.border }]}>
                <Text style={[styles.sourceActionText, { color: colors.foreground }]}>
                  {showClaimedHonors ? 'Hide earned honors' : 'Show earned honors'}
                </Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Forge a new guild honor with the local model"
                disabled={honorBusy || storytellerBusy || generatedFull} onPress={() => void forgeHonor()}
                style={[styles.sourceActionButton, { borderColor: colors.primary, opacity: honorBusy || storytellerBusy || generatedFull ? 0.45 : 1 }]}>
                {honorBusy ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="award" size={14} color={colors.primary} />}
                <Text style={[styles.sourceActionText, { color: colors.primary }]}>Forge an honor</Text>
              </Pressable>
            </View>
            {!!honorNotice && <Text accessibilityRole="alert" style={[styles.muted, { color: colors.primary }]}>{honorNotice}</Text>}
            <Text style={[styles.muted, { color: colors.mutedForeground }]}>
              Pin up to {MAX_PINS} quests and {MAX_PINS} honors; pins float above the videos even with this board closed.
            </Text>

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
                      ? `${enemyPool.length} images ready · ${denEnemyCount} foes at once · ${planWaves(denEnemyCount).length} waves`
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
              <View style={[styles.directorCard, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
                <Feather name={director.mode === 'ai' ? 'cpu' : 'shuffle'} size={14} color={colors.primary} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.directorTitle, { color: colors.foreground }]}>{director.directorLabel}</Text>
                  {combatAutoTagsEnabled && !selectedEnemySource ? (
                    <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                      Auto tag hunts only work with an online enemy source. Select a Rule34 or e621 search above; the slideshow pool is never searched.
                    </Text>
                  ) : director.huntLabel ? (
                    <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                      {director.huntLabel} · temporary, your saved search is not changed
                    </Text>
                  ) : (
                    <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                      Toggle the AI director, enemy speech, and tag hunts in Local Story Settings.
                    </Text>
                  )}
                </View>
              </View>
              {!inDungeon && (
                <View style={{ gap: 6 }}>
                  <View style={styles.batchHeader}>
                    <Text style={[styles.muted, { color: colors.foreground }]}>Enemies on screen: {denEnemyCount}</Text>
                    <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                      Waves {planWaves(denEnemyCount).join(' / ')}
                    </Text>
                  </View>
                  <StepSlider value={denEnemyCount} min={MIN_DEN_ENEMIES} max={MAX_DEN_ENEMIES} limit={MAX_DEN_ENEMIES}
                    disabled={false} onChange={(value) => setDenEnemyCount(clampEnemyCount(value))} label="Enemy count" colors={colors} />
                </View>
              )}
              {!inDungeon ? (
                <Pressable onPress={startDungeon} accessibilityRole="button" disabled={!enemyPool.length}
                  style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: enemyPool.length ? 1 : 0.45 }]}>
                  <Feather name="play" size={16} color={colors.primaryForeground} />
                  <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                    {enemyPool.length ? 'Enter the den' : 'Waiting for enemy images'}
                  </Text>
                </Pressable>
              ) : (
                <View style={styles.skillRow}>
                  <Pressable accessibilityRole="button" onPress={() => setBoardOpen(false)}
                    style={[styles.primaryButton, { backgroundColor: colors.primary, flexGrow: 1 }]}>
                    <Feather name="play" size={16} color={colors.primaryForeground} />
                    <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                      Resume combat · wave {wave}/{wavePlan.length}
                    </Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={leaveDungeon}
                    style={[styles.leaveButton, { borderColor: colors.border }]}>
                    <Text style={[styles.skillText, { color: colors.mutedForeground }]}>Leave the den</Text>
                  </Pressable>
                </View>
              )}
            </View>
            <Text style={[styles.footerNote, { color: colors.mutedForeground }]}>
              Keep your place by the fire: playback continues, and every reward is yours to claim here.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
    <MotionMiniGame visible={visible && arcadeOpen} onClose={() => setArcadeOpen(false)} calm={calm} />
    </>
  );
}

function StepSlider({ value, min, max, limit, disabled, onChange, label, colors }: {
  value: number; min: number; max: number; limit: number; disabled: boolean;
  onChange: (value: number) => void; label: string; colors: ReturnType<typeof useColors>;
}) {
  const steps = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  return (
    <View accessible accessibilityRole="adjustable" accessibilityLabel={label}
      accessibilityValue={{ min, max: limit, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (disabled) return;
        if (event.nativeEvent.actionName === 'increment') onChange(Math.min(limit, value + 1));
        if (event.nativeEvent.actionName === 'decrement') onChange(Math.max(min, value - 1));
      }}
      style={[styles.stepRow, { opacity: disabled ? 0.45 : 1 }]}>
      <Pressable accessibilityElementsHidden importantForAccessibility="no" disabled={disabled || value <= min}
        onPress={() => onChange(Math.max(min, value - 1))} hitSlop={6}
        style={[styles.stepEnd, { borderColor: colors.border }]}>
        <Feather name="minus" size={13} color={colors.foreground} />
      </Pressable>
      <View style={styles.stepTrack}>
        {steps.map((step) => {
          const allowed = step <= limit;
          return (
            <Pressable key={step} accessibilityElementsHidden importantForAccessibility="no"
              disabled={disabled || !allowed} onPressIn={() => onChange(step)} hitSlop={{ top: 10, bottom: 10 }}
              style={[styles.stepCell, {
                backgroundColor: step <= value ? colors.primary : allowed ? colors.muted : colors.card,
                opacity: allowed ? 1 : 0.35,
              }]} />
          );
        })}
      </View>
      <Pressable accessibilityElementsHidden importantForAccessibility="no" disabled={disabled || value >= limit}
        onPress={() => onChange(Math.min(limit, value + 1))} hitSlop={6}
        style={[styles.stepEnd, { borderColor: colors.border }]}>
        <Feather name="plus" size={13} color={colors.foreground} />
      </Pressable>
    </View>
  );
}

function HonorRow({ honor, colors, pinned, pinDisabled, onTogglePin, onClaim, onRemove }: {
  honor: HonorProgress; colors: ReturnType<typeof useColors>; pinned: boolean; pinDisabled: boolean;
  onTogglePin: () => void; onClaim: () => void; onRemove?: () => void;
}) {
  const canClaim = honor.complete && !honor.claimed;
  return (
    <View style={[styles.questRow, { borderColor: canClaim ? colors.primary : colors.border, backgroundColor: colors.secondary }]}>
      <View style={styles.questCopy}>
        <View style={styles.questTitleLine}>
          <Feather name="award" size={12} color={honor.claimed ? colors.primary : colors.mutedForeground} />
          <Text style={[styles.questTitle, { color: colors.foreground }]}>{honor.title}</Text>
          {honor.generated && <Text style={[styles.weeklyTag, { color: colors.primary }]}>FORGED</Text>}
        </View>
        <Text style={[styles.questDescription, { color: colors.mutedForeground }]}>{honor.description}</Text>
        <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${honor.ratio * 100}%` }]} />
        </View>
        <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
          {honor.progress} / {honor.target} {metricLabels[honor.metric]}
        </Text>
      </View>
      {!honor.claimed && (
        <PinToggle pinned={pinned} disabled={pinDisabled} onPress={onTogglePin} label={honor.title} colors={colors} />
      )}
      {onRemove && !canClaim && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${honor.title}`} onPress={onRemove} hitSlop={6}
          style={[styles.pinButton, { borderColor: colors.border }]}>
          <Feather name="trash-2" size={13} color={colors.mutedForeground} />
        </Pressable>
      )}
      <Pressable accessibilityRole="button" disabled={!canClaim}
        accessibilityLabel={honor.claimed ? `${honor.title} earned` : `Claim ${honor.title}`}
        onPress={onClaim}
        style={[styles.claimButton, { backgroundColor: canClaim ? colors.primary : colors.card, opacity: honor.claimed ? 0.5 : 1 }]}>
        <Text style={[styles.claimText, { color: canClaim ? colors.primaryForeground : colors.mutedForeground }]}>
          {honor.claimed ? 'Earned' : 'Claim'}
        </Text>
      </Pressable>
    </View>
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
  speechAfterglow: { ...StyleSheet.absoluteFill, zIndex: 91, elevation: 91 },
  directorCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 10 },
  directorTitle: { fontSize: 12, fontWeight: '800' },
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
  pinButton: { width: 32, height: 32, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  batchHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  batchProgress: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepEnd: { width: 34, height: 34, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stepTrack: { flex: 1, flexDirection: 'row', gap: 3, height: 22, alignItems: 'stretch' },
  stepCell: { flex: 1, borderRadius: 2 },
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
