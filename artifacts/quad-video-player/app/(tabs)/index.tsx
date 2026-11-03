import { Feather, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Speech from 'expo-speech';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar } from 'expo-navigation-bar';
import { useEventListener } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import { GameText as Text } from '@/components/GameText';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ColorContext, useColors } from '@/hooks/useColors';
import { useAutoHideControls } from '@/hooks/useAutoHideControls';
import BackgroundAudioMixer from '@/components/audio/BackgroundAudioMixer';
import SettingSwitch from '@/components/SettingSwitch';
import FadingControls from '@/components/FadingControls';
import TouchSlider from '@/components/TouchSlider';
import ControlsTimeoutSetting from '@/components/ControlsTimeoutSetting';
import PoolVideoPreview from '@/components/PoolVideoPreview';
import PlayerRewardsSettings from '@/components/PlayerRewardsSettings';
import PlayerRpgDashboard from '@/components/PlayerRpgDashboard';
import RpgTownHub from '@/components/RpgTownHub';
import GoonQuestOverlay from '@/components/GoonQuestOverlay';
import LocalStorySettings from '@/components/LocalStorySettings';
import ReleaseNotesPanel from '@/components/ReleaseNotesPanel';
import PixelFamiliar from '@/components/PixelFamiliar';
import PlayExtrasSettings from '@/components/PlayExtrasSettings';
import KeyJingleOverlay from '@/components/KeyJingleOverlay';
import HeartRateSettings from '@/components/HeartRateSettings';
import ScreenBorder from '@/components/ScreenBorder';
import SoundEffectsSettings from '@/components/SoundEffectsSettings';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { usePlayerSoundEffects, useSoundSettings } from '@/hooks/useSoundSettings';
import { usePlayerRewardsSettings } from '@/hooks/usePlayerRewardsSettings';
import { useSessionRegistry } from '@/hooks/useSessionRegistry';
import SessionControls from '@/components/SessionControls';
import ViewingSessionTimer from '@/components/ViewingSessionTimer';
import SessionStatsOverlay from '@/components/SessionStatsOverlay';
import { useAutomaticVideoBpm } from '@/hooks/useAutomaticVideoBpm';
import { useLiveHeartRate } from '@/hooks/useLiveHeartRate';
import { averageVideoBpm } from '@/lib/bpm-cache';
import { slotMayPlay } from '@/lib/playback-policy';
import { useViewingSessions } from '@/hooks/useViewingSessions';
import { usePlayerRpg } from '@/hooks/usePlayerRpg';
import { useLocalStoryModel } from '@/hooks/useLocalStoryModel';
import { usePlayExtrasSettings } from '@/hooks/usePlayExtrasSettings';
import { parseSession, seekPosition, SESSION_KEY, type SessionSnapshot, type VideoSnapshot } from '@/lib/sessions';
import { prepareVideoSlot, QUAD_BUFFER_OPTIONS } from '@/lib/player-startup';
import { showCrashReport } from '@/components/CrashReportNotice';
import { useSlideshow } from '@/hooks/useSlideshow';
import { DEFAULT_SLIDESHOW } from '@/lib/slideshow';
import SlideshowOverlay from '@/components/slideshow/SlideshowOverlay';
import SlideshowPanel from '@/components/slideshow/SlideshowPanel';
import OnlineSourcesPanel from '@/components/sources/OnlineSourcesPanel';
import { useOnlineSources } from '@/hooks/useOnlineSources';
import type { RemoteMedia } from '@/lib/online-sources';
import { pickMediaFiles } from '@/lib/media-picker';
import { DEFAULT_CONTROLS_HIDE_SECONDS, parseControlsHideSeconds } from '@/lib/controls-visibility';
import { readDownloadsVideos } from '@/lib/downloads-library';
import { getVideoAudioMode } from '@/lib/audio-mode';
import { mergeGeneratedAchievements, parseGeneratedAchievements, playerAchievements, type PlayerAchievement } from '@/lib/player-achievements';
import { celebrationLineForMinute, congratulationsFor, effectiveBorderThickness, isBorderUnlocked, isThemeUnlocked, mergeGeneratedCheers, messagesForCongratText, themeUnlockLevels } from '@/lib/player-rewards';
import { hasVideoExtension, isVideoFile, mediaPlaybackError, videoSourceForUri } from '@/lib/media-formats';
import { inspectVideoPlayback } from '@/lib/video-diagnostics';
import {
  applyVideoWatchHistory, formatLastPlayed, pickInitialVideos, pickNextVideo,
  parseVideoWatchHistory, VIDEO_WATCH_HISTORY_KEY,
  type VideoAsset, type VideoWatchHistory,
} from '@/lib/video-playback';
import {
  getThemeColors,
  themePresets,
  type ThemeId,
} from '@/constants/colors';
import {
  createGoonQuestBackup, MAX_BACKUP_CHARS, parseGoonQuestBackup,
} from '@/lib/goon-quest-backup';
import { PLAYER_RPG_KEY, type GoonQuestClassId } from '@/lib/player-rpg';
import type { CombatControlScheme } from '@/lib/input-controls';
import { PLAYER_REWARDS_KEY } from '@/lib/player-rewards';
import { elapsedViewingTime, VIEWING_SESSIONS_KEY } from '@/lib/viewing-sessions';
import { PLAY_EXTRAS_KEY } from '@/lib/play-extras';

type ActivePanel = 'settings' | 'pool' | 'audio' | 'slideshow' | 'sources' | null;
type VideoBpmReport = { bpm: number | null; confidence: number; error?: string };
const SETTINGS_CATEGORIES = [
  { id: 'playback', title: 'Playback', description: 'Video layout, volume modes, and control timing.', icon: 'play-circle' },
  { id: 'controls', title: 'Controls & input', description: 'Choose touch or S Pen taps for combat targets.', icon: 'edit-3' },
  { id: 'appearance', title: 'Appearance & sensory', description: 'OLED-black accent themes and calmer palettes.', icon: 'eye' },
  { id: 'audio', title: 'Audio & voice', description: 'Effects, background sounds, keys, and spoken messages.', icon: 'volume-2' },
  { id: 'progression', title: 'RPG & rewards', description: 'Quests, skills, borders, and progression settings.', icon: 'award' },
  { id: 'story-ai', title: 'Storyteller AI', description: 'Import a local model and shape its character prompt.', icon: 'cpu' },
  { id: 'heart-rate', title: 'Heart rate', description: 'Connect the watch, phone, and tablet.', icon: 'heart' },
  { id: 'media', title: 'Media sources', description: 'Online searches and the image/GIF slideshow pool.', icon: 'image' },
  { id: 'data', title: 'Backup & diagnostics', description: 'Transfer progress and inspect crash reports.', icon: 'archive' },
  { id: 'patch-notes', title: 'Patch notes', description: 'Read the quirky names and changes in each update.', icon: 'book-open' },
] as const;
type SettingsCategory = (typeof SETTINGS_CATEGORIES)[number]['id'];

function formatVideoClock(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainder = wholeSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

const THEME_STORAGE_KEY = 'quad-video-player.theme';
const COMBAT_CONTROL_SCHEME_KEY = 'goon-quest.combat-control-scheme.v1';
const NORMALIZE_STORAGE_KEY = 'quad-video-player.normalize';
const SYNC_STORAGE_KEY = 'quad-video-player.sync';
const VIDEO_FILL_STORAGE_KEY = 'quad-video-player.video-fill';
const CONTROLS_DELAY_STORAGE_KEY = 'quad-video-player.controls-hide-seconds';
const AI_ACHIEVEMENTS_KEY = 'goon-quest.ai-achievements.v1';

function isThemeId(value: string | null): value is ThemeId {
  return themePresets.some((theme) => theme.id === value);
}

const START_VOLUME = 0.25;
const NORMALIZATION_APK_ERROR = 'Loudness normalization requires the standalone Android APK, not Expo Go.';

function isSupportedVideo(name: string) {
  return hasVideoExtension(name);
}

async function scanFolderForVideos(rootUri: string) {
  const videos: VideoAsset[] = [];
  const folders = [rootUri];
  const visitedFolders = new Set<string>();
  let unreadableSubfolders = 0;

  while (folders.length > 0) {
    const directoryUri = folders.pop()!;
    if (visitedFolders.has(directoryUri)) continue;
    visitedFolders.add(directoryUri);

    let entries: ReturnType<Directory['list']>;
    try {
      entries = new Directory(directoryUri).list();
    } catch (error) {
      if (directoryUri === rootUri) throw error;
      unreadableSubfolders += 1;
      continue;
    }

    for (const entry of entries) {
      if (entry instanceof Directory) {
        folders.push(entry.uri);
      } else if (isSupportedVideo(entry.name)) {
        videos.push({
          id: entry.uri,
          name: entry.name,
          uri: entry.uri,
        });
      }
    }
  }

  return { videos, unreadableSubfolders };
}

function ActionButton({
  icon,
  label,
  onPress,
  disabled = false,
  primary = false,
  compact = false,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  compact?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        compact && styles.actionButtonCompact,
        primary
          ? { backgroundColor: colors.primary }
          : { backgroundColor: colors.secondary },
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressedButton,
      ]}
    >
      <Feather
        name={icon}
        size={compact ? 17 : 18}
        color={primary ? colors.primaryForeground : colors.foreground}
      />
      {!compact && (
        <Text
          numberOfLines={1}
          style={[
            styles.actionLabel,
            { color: primary ? colors.primaryForeground : colors.foreground },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function VideoTile({
  asset,
  pool,
  index,
  bpmByVideoId,
  globalPlaying,
  normalizeLoudness,
  linkedVolume,
  sharedVolume,
  onSharedVolumeChange,
  fillVideos,
  focusIndex,
  tileVisible,
  onToggleFocus,
  controlsVisible,
  controlsEnabled,
  onToggleControls,
  initialSnapshot,
  playbackId,
  onPlaybackStateChange,
  onVideoStarted,
  getNextVideo,
  onAssetChange,
  onPlaybackProgress,
  onPlaybackEnded,
  stopAtEnd,
}: {
  asset: VideoAsset;
  pool: VideoAsset[];
  index: number;
  bpmByVideoId: Record<string, VideoBpmReport>;
  globalPlaying: boolean;
  normalizeLoudness: boolean;
  linkedVolume: boolean;
  sharedVolume: number;
  onSharedVolumeChange: (volume: number) => void;
  fillVideos: boolean;
  focusIndex: number | null;
  tileVisible: boolean;
  onToggleFocus: (index: number) => void;
  controlsVisible: boolean;
  controlsEnabled: boolean;
  onToggleControls: () => void;
  initialSnapshot?: VideoSnapshot;
  playbackId: string;
  onPlaybackStateChange: (playbackId: string, playing: boolean, videoUri?: string) => void;
  onVideoStarted: (videoId: string) => void;
  getNextVideo: (slot: number, currentId: string) => VideoAsset | undefined;
  onAssetChange: (slot: number, next: VideoAsset) => void;
  onPlaybackProgress: (slot: number, progress: { currentTime: number; duration: number }) => void;
  onPlaybackEnded: (slot: number) => void;
  stopAtEnd: boolean;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [currentAsset, setCurrentAsset] = useState(asset);
  const bpm = bpmByVideoId[currentAsset.id]?.bpm ?? null;
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(initialSnapshot?.muted ?? false);
  const [individualVolume, setIndividualVolume] = useState(initialSnapshot?.volume ?? START_VOLUME);
  const volume = linkedVolume ? sharedVolume : individualVolume;
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [diagnosing, setDiagnosing] = useState(false);
  const [volumeTrackRect, setVolumeTrackRect] = useState({ x: 0, width: 0 });
  const volumeTrackRef = useRef<React.ComponentRef<typeof View>>(null);
  const [playbackProgress, setPlaybackProgress] = useState({ currentTime: 0, duration: 0 });
  const [seekingTime, setSeekingTime] = useState<number | null>(null);
  const currentAssetRef = useRef(asset);
  currentAssetRef.current = currentAsset;
  const playModeRef = useRef({ focusIndex, globalPlaying, index });
  playModeRef.current = { focusIndex, globalPlaying, index };
  const registry = useSessionRegistry();
  const pendingPosition = useRef<number | null>(initialSnapshot?.position ?? null);
  const restorePlaying = useRef(initialSnapshot?.playing ?? true);
  const firstGlobalEffect = useRef(true);
  const previousPlayMode = useRef({ focusIndex, globalPlaying });
  const changingSource = useRef(false);
  const sourcePrepared = useRef(false);
  const nextSourcePlaying = useRef(false);
  const snapshotState = useRef({ individualVolume, isMuted, globalPlaying });
  snapshotState.current = { individualVolume, isMuted, globalPlaying };

  const player = useVideoPlayer(null, (videoPlayer) => {
    videoPlayer.bufferOptions = QUAD_BUFFER_OPTIONS;
    videoPlayer.loop = false;
    videoPlayer.timeUpdateEventInterval = 1;
    videoPlayer.volume = linkedVolume ? sharedVolume : (initialSnapshot?.volume ?? START_VOLUME);
    videoPlayer.muted = initialSnapshot?.muted ?? false;
    videoPlayer.audioMixingMode = 'mixWithOthers';
    videoPlayer.keepScreenOnWhilePlaying = true;
  });
  const updatePlaybackProgress = useCallback((currentTime: number) => {
    const duration = player.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const progress = {
      currentTime: Math.max(0, Math.min(duration, Number.isFinite(currentTime) ? currentTime : 0)),
      duration,
    };
    setPlaybackProgress(progress);
    onPlaybackProgress(index, progress);
  }, [index, onPlaybackProgress, player]);
  usePlayerSoundEffects(player);
  useEffect(() => prepareVideoSlot(
    player, asset.uri, index,
    () => {
      sourcePrepared.current = true;
      return pendingPosition.current === null && restorePlaying.current &&
        playModeRef.current.globalPlaying &&
        (playModeRef.current.focusIndex === null || playModeRef.current.focusIndex === playModeRef.current.index);
    },
    (error) => {
      setErrorMessage(mediaPlaybackError(error instanceof Error ? error.message : undefined));
      setIsLoading(false);
    },
  ), [asset.uri, index, player]);
  const restorePosition = useCallback(() => {
    if (pendingPosition.current === null) return;
    player.currentTime = seekPosition(pendingPosition.current, player.duration);
    pendingPosition.current = null;
    updatePlaybackProgress(player.currentTime);
    if (restorePlaying.current && globalPlaying && (focusIndex === null || focusIndex === index)) player.play();
    else player.pause();
  }, [focusIndex, globalPlaying, index, player, updatePlaybackProgress]);
  useEventListener(player, 'sourceLoad', restorePosition);
  useEventListener(player, 'timeUpdate', ({ currentTime }) => updatePlaybackProgress(currentTime));
  useEffect(() => {
    if (player.status === 'readyToPlay') restorePosition();
  }, [player, restorePosition]);
  useEffect(() => {
    const capture = (): VideoSnapshot => ({
      asset: currentAssetRef.current,
      position: pendingPosition.current ?? (changingSource.current ? 0 : Math.max(0, player.currentTime || 0)),
      volume: snapshotState.current.individualVolume,
      muted: snapshotState.current.isMuted,
      playing: restorePlaying.current,
    });
    registry.videos.set(index, capture);
    return () => { if (registry.videos.get(index) === capture) registry.videos.delete(index); };
  }, [index, player, registry]);

  const advance = useCallback(
    async (forcePlayback = false) => {
      const next = getNextVideo(index, currentAssetRef.current.id);
      if (!next) return;
      const shouldResume = forcePlayback || restorePlaying.current;
      changingSource.current = true;
      nextSourcePlaying.current = shouldResume;
      restorePlaying.current = shouldResume;
      setPlaybackProgress({ currentTime: 0, duration: 0 });
      setSeekingTime(null);
      currentAssetRef.current = next;
      onAssetChange(index, next);
      setCurrentAsset(next);
      setErrorMessage('');
      setIsLoading(true);
      try {
        await player.replaceAsync(videoSourceForUri(next.uri));
        const mode = playModeRef.current;
        if (restorePlaying.current && slotMayPlay(mode.globalPlaying, mode.focusIndex, index)) player.play();
        else player.pause();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : 'This video could not be opened.',
        );
        setIsLoading(false);
      }
    },
    [focusIndex, getNextVideo, globalPlaying, index, onAssetChange, player],
  );

  useEventListener(player, 'playToEnd', () => {
    if (stopAtEnd) {
      player.pause();
      onPlaybackEnded(index);
      return;
    }
    void advance(true);
  });

  useEventListener(player, 'playingChange', ({ isPlaying: playing }) => {
    const mode = playModeRef.current;
    if (playing && !slotMayPlay(mode.globalPlaying, mode.focusIndex, index)) {
      player.pause();
      setIsPlaying(false);
      onPlaybackStateChange(playbackId, false);
      return;
    }
    setIsPlaying(playing);
    if (playing) onVideoStarted(currentAssetRef.current.id);
    onPlaybackStateChange(playbackId, playing, playing ? currentAssetRef.current.uri : undefined);
  });
  useEffect(() => () => onPlaybackStateChange(playbackId, false), [onPlaybackStateChange, playbackId]);

  useEventListener(player, 'statusChange', ({ status, error }) => {
    setIsLoading(status === 'loading' || status === 'idle');
    if (status === 'error') {
      setErrorMessage(mediaPlaybackError(error?.message));
    } else if (status === 'readyToPlay') {
      sourcePrepared.current = true;
      changingSource.current = false;
      setErrorMessage('');
      updatePlaybackProgress(player.currentTime);
      restorePosition();
    }
  });

  useEffect(() => {
    player.volume = volume;
  }, [player, volume]);

  useEffect(() => {
    if (pool.length > 0 && !pool.some((item) => item.id === currentAssetRef.current.id)) {
      void advance();
    }
  }, [advance, pool]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const nativePlayer = player as typeof player & { normalizeLoudness?: boolean };
    if (typeof nativePlayer.normalizeLoudness === 'boolean') {
      nativePlayer.normalizeLoudness = normalizeLoudness;
    } else if (normalizeLoudness) {
      setErrorMessage(NORMALIZATION_APK_ERROR);
    }
    if (!normalizeLoudness) {
      setErrorMessage((current) => current === NORMALIZATION_APK_ERROR ? '' : current);
    }
  }, [normalizeLoudness, player]);

  useEffect(() => {
    player.muted = isMuted;
  }, [isMuted, player]);

  useEffect(() => {
    const globalChanged = previousPlayMode.current.globalPlaying !== globalPlaying;
    const focusChanged = previousPlayMode.current.focusIndex !== focusIndex;
    previousPlayMode.current = { focusIndex, globalPlaying };
    if (firstGlobalEffect.current) {
      firstGlobalEffect.current = false;
    } else if (globalChanged) {
      restorePlaying.current = globalPlaying;
    } else if (focusChanged && focusIndex === index && globalPlaying) {
      restorePlaying.current = true;
    }
    if (!slotMayPlay(globalPlaying, focusIndex, index)) {
      player.pause();
      return;
    }
    if (pendingPosition.current !== null || !sourcePrepared.current) return;
    if (restorePlaying.current) {
      player.play();
    } else {
      player.pause();
    }
  }, [focusIndex, globalPlaying, index, initialSnapshot, player]);

  const commitVolume = useCallback(
    (nextVolume: number) => {
      if (linkedVolume) {
        onSharedVolumeChange(nextVolume);
      } else {
        setIndividualVolume(nextVolume);
      }
      if (nextVolume > 0) setIsMuted(false);
    },
    [linkedVolume, onSharedVolumeChange],
  );

  const measureVolumeTrack = useCallback(() => {
    volumeTrackRef.current?.measureInWindow((x, _y, width) => {
      setVolumeTrackRect((current) => current.x === x && current.width === width ? current : { x, width });
    });
  }, []);
  const setVolumeFromTouch = useCallback(
    (pageX: number) => {
      const { x, width } = volumeTrackRect;
      if (width <= 0) return;
      const nextVolume = Math.min(1, Math.max(0, (pageX - x) / width));
      commitVolume(nextVolume);
    },
    [commitVolume, volumeTrackRect],
  );
  const seekTo = useCallback((position: number) => {
    if (!Number.isFinite(player.duration) || player.duration <= 0) return;
    const currentTime = seekPosition(position, player.duration);
    player.currentTime = currentTime;
    setPlaybackProgress({ currentTime, duration: player.duration });
    setSeekingTime(null);
  }, [player]);

  const toggleTilePlayback = () => {
    if (player.playing) {
      restorePlaying.current = false;
      player.pause();
    } else {
      restorePlaying.current = true;
      player.play();
    }
  };

  const retry = async () => {
    changingSource.current = true;
    const shouldPlay = globalPlaying && (focusIndex === null || focusIndex === index) && restorePlaying.current;
    nextSourcePlaying.current = shouldPlay;
    restorePlaying.current = shouldPlay;
    setErrorMessage('');
    setIsLoading(true);
    try {
      await player.replaceAsync(videoSourceForUri(currentAsset.uri));
      const mode = playModeRef.current;
      if (restorePlaying.current && slotMayPlay(mode.globalPlaying, mode.focusIndex, index)) player.play();
      else player.pause();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'This video could not be opened.',
      );
      setIsLoading(false);
    }
  };

  const showPlaybackDetails = async () => {
    if (diagnosing) return;
    setDiagnosing(true);
    const inspectedAsset = currentAssetRef.current;
    try {
      const details = await inspectVideoPlayback(inspectedAsset.uri);
      const report = `${inspectedAsset.name}\n\n${details}\n\nNative playback error:\n${errorMessage}`;
      Alert.alert('Video playback details', report, [
        { text: 'Close', style: 'cancel' },
        { text: 'Share report', onPress: () => {
          void Share.share({ message: report }).catch(() => Alert.alert('Could not share report', report));
        } },
      ]);
    } catch (error) {
      Alert.alert('Could not inspect video', error instanceof Error ? error.message : String(error));
    } finally {
      setDiagnosing(false);
    }
  };

  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: colors.card, borderColor: colors.border, display: tileVisible ? 'flex' : 'none' },
      ]}
    >
      <View style={[styles.videoFrame, { backgroundColor: colors.background }]}>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit={fillVideos ? 'cover' : 'contain'}
          nativeControls={false}
          surfaceType="textureView"
        />
        <Pressable
          disabled={!controlsEnabled}
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={`Show playback controls for stream ${index + 1}`}
          accessible={!controlsVisible}
          onPress={onToggleControls}
        />
        {isLoading && !errorMessage && (
          <View pointerEvents="none" style={styles.videoStatus}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.videoStatusText, { color: colors.mutedForeground }]}>
              Loading video
            </Text>
          </View>
        )}
        {!!errorMessage && (
          <View style={styles.videoStatus}>
            <Ionicons name="warning-outline" size={21} color={colors.destructive} />
            <Text
              numberOfLines={2}
              style={[styles.videoStatusText, { color: colors.foreground }]}
            >
              {errorMessage}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Show playback details for stream ${index + 1}`}
              disabled={diagnosing}
              onPress={() => void showPlaybackDetails()}
              style={[styles.retryButton, { borderColor: colors.border }]}
            >
              <Text style={[styles.retryText, { color: colors.accentForeground }]}>{diagnosing ? 'Inspecting…' : 'Details'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Retry stream ${index + 1}`}
              onPress={() => void retry()}
              style={[styles.retryButton, { borderColor: colors.border }]}
            >
              <Text style={[styles.retryText, { color: colors.accentForeground }]}>Retry</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Skip failed video in stream ${index + 1}`}
              onPress={() => void advance(true)}
              style={[styles.retryButton, { borderColor: colors.border }]}
            >
              <Text style={[styles.retryText, { color: colors.accentForeground }]}>Skip</Text>
            </Pressable>
          </View>
        )}
      </View>

      <FadingControls visible={controlsVisible} style={[
        styles.tileHeader,
        {
          backgroundColor: colors.playbackOverlay,
          top: index < 2 ? 60 + insets.top : 0,
          paddingLeft: 10 + (index % 2 === 0 ? insets.left : 0),
          paddingRight: 10 + (index % 2 === 1 ? insets.right : 0),
        },
      ]}>
        <View style={[styles.streamNumber, { backgroundColor: colors.accent }]}>
          <Text style={[styles.streamNumberText, { color: colors.accentForeground }]}>
            0{index + 1}
          </Text>
        </View>
        <Text numberOfLines={1} ellipsizeMode="middle" style={[styles.videoName, { color: colors.foreground }]}>
          {currentAsset.name}
        </Text>
        <View style={[styles.bpmPill, { backgroundColor: colors.secondary }]}>
          <Feather name="activity" size={11} color={colors.primary} />
          <Text style={[styles.bpmText, { color: colors.foreground }]}>
            {bpm === null ? 'BPM —' : `${bpm} BPM`}
          </Text>
        </View>
        <View style={[styles.liveDot, { backgroundColor: errorMessage ? colors.destructive : colors.primary }]} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={focusIndex === index ? 'Return to quad stream' : `Show stream ${index + 1} full screen`}
          onPress={() => onToggleFocus(index)}
          hitSlop={12}
          style={styles.focusButton}
        >
          <Feather name={focusIndex === index ? 'minimize-2' : 'maximize-2'} size={15} color={colors.foreground} />
        </Pressable>
      </FadingControls>

      <FadingControls visible={controlsVisible} style={[
        styles.tileControls,
        {
          backgroundColor: colors.playbackOverlay,
          paddingBottom: index >= 2 ? insets.bottom + 4 : 4,
          paddingLeft: 8 + (index % 2 === 0 ? insets.left : 0),
          paddingRight: 8 + (index % 2 === 1 ? insets.right : 0),
        },
      ]}>
        <View style={styles.tileControlRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${isPlaying ? 'Pause' : 'Play'} stream ${index + 1}`}
          onPress={toggleTilePlayback}
          style={({ pressed }) => [styles.iconControl, pressed && styles.pressedButton]}
        >
          <Feather
            name={isPlaying ? 'pause' : 'play'}
            size={18}
            color={colors.foreground}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Play another video in stream ${index + 1}`}
          onPress={() => void advance(true)}
          style={({ pressed }) => [styles.iconControl, pressed && styles.pressedButton]}
        >
          <Feather name="skip-forward" size={17} color={colors.foreground} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${isMuted ? 'Unmute' : 'Mute'} stream ${index + 1}`}
          onPress={() => setIsMuted((muted) => !muted)}
          style={({ pressed }) => [styles.iconControl, pressed && styles.pressedButton]}
        >
          <Feather
            name={isMuted || volume === 0 ? 'volume-x' : 'volume-2'}
            size={17}
            color={isMuted ? colors.accentForeground : colors.foreground}
          />
        </Pressable>
        <View
          accessibilityRole="adjustable"
          accessibilityLabel={linkedVolume ? 'Shared volume for all streams' : `Volume for stream ${index + 1}`}
          accessibilityValue={{
            min: 0,
            max: 100,
            now: Math.round(volume * 100),
          }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={({ nativeEvent }) => {
            if (nativeEvent.actionName === 'increment') {
              commitVolume(Math.min(1, volume + 0.05));
            } else if (nativeEvent.actionName === 'decrement') {
              commitVolume(Math.max(0, volume - 0.05));
            }
          }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(event) =>
            setVolumeFromTouch(event.nativeEvent.pageX)
          }
          onResponderMove={(event) =>
            setVolumeFromTouch(event.nativeEvent.pageX)
          }
          style={styles.volumeTrackHitbox}
        >
          <View ref={volumeTrackRef} onLayout={measureVolumeTrack}
            style={[styles.volumeTrack, { backgroundColor: colors.muted }]}>
            <View
              style={[
                styles.volumeFill,
                { backgroundColor: colors.primary, width: `${volume * 100}%` },
              ]}
            />
          </View>
        </View>
        <Text style={[styles.volumePercent, { color: colors.mutedForeground }]}>
          {Math.round(volume * 100)}
        </Text>
        </View>
        <View style={styles.seekBarRow}>
          <Text style={[styles.seekTime, { color: colors.mutedForeground }]}>
            {formatVideoClock(seekingTime ?? playbackProgress.currentTime)}
          </Text>
          <TouchSlider
            style={styles.seekSlider}
            accessibilityLabel={`Seek stream ${index + 1}`}
            accessibilityValue={{
              min: 0,
              max: playbackProgress.duration,
              now: seekingTime ?? playbackProgress.currentTime,
            }}
            minimumValue={0}
            maximumValue={playbackProgress.duration > 0 ? playbackProgress.duration : 1}
            step={1}
            value={seekingTime ?? playbackProgress.currentTime}
            disabled={!Number.isFinite(playbackProgress.duration) || playbackProgress.duration <= 0 || isLoading}
            onSlidingStart={() => setSeekingTime(playbackProgress.currentTime)}
            onDraftValueChange={(value) => setSeekingTime(value)}
            onSlidingComplete={seekTo}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.muted}
            thumbTintColor={colors.primary}
          />
          <Text style={[styles.seekTime, { color: colors.mutedForeground }]}>
            {formatVideoClock(playbackProgress.duration)}
          </Text>
        </View>
      </FadingControls>
    </View>
  );
}

export default function QuadVideoPlayerScreen() {
  const { slideshow, captureSlideshow, restoreSlideshow } = useSlideshow();
  const localStory = useLocalStoryModel();
  const online = useOnlineSources();
  const [sourcesReturn, setSourcesReturn] = useState<'settings' | 'slideshow'>('settings');
  const [slideshowReturn, setSlideshowReturn] = useState<'settings' | null>('settings');
  const { inPip, enterPip, pipClosed, sound, setSound, loaded: soundLoaded } = useSoundSettings();
  const registry = useSessionRegistry();
  const [sessionBusy, setSessionBusy] = useState(false);
  const [restoredStreams, setRestoredStreams] = useState<VideoSnapshot[] | null>(null);
  const [themeId, setThemeId] = useState<ThemeId>('amethyst');
  const [controlScheme, setControlScheme] = useState<CombatControlScheme>('touch');
  const [controlSchemeLoaded, setControlSchemeLoaded] = useState(false);
  const colors = getThemeColors(themeId);
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [normalizeEnabled, setNormalizeEnabled] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [fillVideos, setFillVideos] = useState(false);
  const [controlsHideSeconds, setControlsHideSeconds] = useState(DEFAULT_CONTROLS_HIDE_SECONDS);
  const audioMode = getVideoAudioMode(normalizeEnabled, syncEnabled);
  const [playbackSettingsLoaded, setPlaybackSettingsLoaded] = useState(false);
  const [sharedVolume, setSharedVolume] = useState(START_VOLUME);
  const [backgroundTrackCount, setBackgroundTrackCount] = useState(0);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory | null>(null);
  const selectedSettingsCategory = SETTINGS_CATEGORIES.find((category) => category.id === settingsCategory);
  const closeSettings = () => {
    setSettingsCategory(null);
    setActivePanel(null);
  };
  const [questVisible, setQuestVisible] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [statsVisible, setStatsVisible] = useState(false);
  const [standingsVisible, setStandingsVisible] = useState(false);
  const [combatActive, setCombatActive] = useState(false);
  const [townHubVisible, setTownHubVisible] = useState(false);
  const [questSourcesReturn, setQuestSourcesReturn] = useState(false);
  const [singleStreamIndex, setSingleStreamIndex] = useState<number | null>(null);
  const [sessionListRevision, setSessionListRevision] = useState(0);
  const [pool, setPool] = useState<VideoAsset[]>([]);
  const [activeVideos, setActiveVideos] = useState<VideoAsset[]>([]);
  const [liveSlots, setLiveSlots] = useState<Record<number, VideoAsset>>({});
  // Playback seeds stay stable (no replaceAsync race on every random advance).
  // UI consumers separately follow the actual asset in each native player.
  const liveVideos = activeVideos.map((seed, slot) => liveSlots[slot] ?? seed);
  const automaticBpm = useAutomaticVideoBpm(pool, liveVideos);
  const videoBpmById = automaticBpm.byId;
  const liveHeartRate = useLiveHeartRate();
  const [clockNow, setClockNow] = useState(Date.now());
  const [watchHistory, setWatchHistory] = useState<VideoWatchHistory>({});
  const [watchHistoryLoaded, setWatchHistoryLoaded] = useState(false);
  const watchHistoryRef = useRef<VideoWatchHistory>({});
  const watchHistoryWritable = useRef(false);
  const watchHistoryWriteQueue = useRef(Promise.resolve());
  const activeAssetsRef = useRef(new Map<number, VideoAsset>());
  const [session, setSession] = useState(0);
  const [globalPlaying, setGlobalPlaying] = useState(true);
  const [playingQuadrants, setPlayingQuadrants] = useState<Set<string>>(() => new Set());
  const [questVideoIndex, setQuestVideoIndex] = useState(0);
  const [questVideoProgress, setQuestVideoProgress] = useState({ currentTime: 0, duration: 0 });
  const [bossVideoIndex, setBossVideoIndex] = useState<number | null>(null);
  const [bossVideoEnded, setBossVideoEnded] = useState(false);
  const videoProgressBySlot = useRef<Record<number, { currentTime: number; duration: number }>>({});
  const previousStreamFocus = useRef<number | null>(null);
  const bossFocusCaptured = useRef(false);
  const [isPicking, setIsPicking] = useState(false);
  const [sourceLabel, setSourceLabel] = useState('');
  const insets = useSafeAreaInsets();
  const hasVideos = activeVideos.length > 0;
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(COMBAT_CONTROL_SCHEME_KEY)
      .then((stored) => {
        if (!cancelled) setControlScheme(stored === 'spen' ? 'spen' : 'touch');
      })
      .catch(() => {
        if (!cancelled) setControlScheme('touch');
      })
      .finally(() => {
        if (!cancelled) setControlSchemeLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);
  const updateControlScheme = useCallback((useSpen: boolean) => {
    const next: CombatControlScheme = useSpen ? 'spen' : 'touch';
    setControlScheme(next);
    void AsyncStorage.setItem(COMBAT_CONTROL_SCHEME_KEY, next).catch(() => {
      Alert.alert('Setting not saved', 'The combat control choice could not be saved on this device.');
    });
  }, []);
  const reportQuadrantPlayback = useCallback((playbackId: string, playing: boolean, videoUri?: string) => {
    if (playing && videoUri) {
      const lastPlayedAt = Date.now();
      const nextHistory = { ...watchHistoryRef.current, [videoUri]: lastPlayedAt };
      watchHistoryRef.current = nextHistory;
      setWatchHistory(nextHistory);
      setPool((current) => current.map((asset) => asset.uri === videoUri ? { ...asset, lastPlayedAt } : asset));
    }
    setPlayingQuadrants((current) => {
      if (current.has(playbackId) === playing) return current;
      const next = new Set(current);
      if (playing) next.add(playbackId);
      else next.delete(playbackId);
      return next;
    });
  }, []);
  const reportVideoProgress = useCallback((slot: number, progress: { currentTime: number; duration: number }) => {
    videoProgressBySlot.current[slot] = progress;
    if ((questVisible || bossVideoIndex !== null) && (slot === questVideoIndex || slot === bossVideoIndex)) {
      setQuestVideoProgress(progress);
    }
  }, [bossVideoIndex, questVideoIndex, questVisible]);
  const selectQuestVideo = useCallback((slot: number) => {
    setQuestVideoIndex(slot);
    setQuestVideoProgress(videoProgressBySlot.current[slot] ?? { currentTime: 0, duration: 0 });
  }, []);
  const beginBossVideo = useCallback((slot: number) => {
    previousStreamFocus.current = singleStreamIndex;
    bossFocusCaptured.current = true;
    setQuestVideoIndex(slot);
    setQuestVideoProgress(videoProgressBySlot.current[slot] ?? { currentTime: 0, duration: 0 });
    setBossVideoEnded(false);
    setBossVideoIndex(slot);
    setSingleStreamIndex(slot);
  }, [singleStreamIndex]);
  const endBossVideo = useCallback(() => {
    if (!bossFocusCaptured.current) return;
    bossFocusCaptured.current = false;
    setBossVideoIndex(null);
    setBossVideoEnded(false);
    setSingleStreamIndex(previousStreamFocus.current);
    previousStreamFocus.current = null;
  }, []);
  const reportVideoEnded = useCallback((slot: number) => {
    if (bossVideoIndex === slot) setBossVideoEnded(true);
  }, [bossVideoIndex]);
  const recordVideoBpm = useCallback((videoId: string, result: VideoBpmReport) => {
    automaticBpm.recordResult(videoId, result);
  }, [automaticBpm.recordResult]);
  useEffect(() => {
    if (!questVisible || bossVideoIndex !== null) return;
    setQuestVideoProgress(videoProgressBySlot.current[questVideoIndex] ?? { currentTime: 0, duration: 0 });
  }, [bossVideoIndex, questVideoIndex, questVisible]);
  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(VIDEO_WATCH_HISTORY_KEY)
      .then((raw) => {
        const history = parseVideoWatchHistory(raw);
        if (!mounted) return;
        watchHistoryRef.current = history;
        watchHistoryWritable.current = true;
        setWatchHistory(history);
        setPool((current) => applyVideoWatchHistory(current, history));
      })
      .catch((error) => {
        if (mounted) Alert.alert('Video history unavailable',
          error instanceof Error ? error.message : 'Could not restore last-played times.');
      })
      .finally(() => { if (mounted) setWatchHistoryLoaded(true); });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    if (!watchHistoryLoaded || !watchHistoryWritable.current) return;
    const snapshot = JSON.stringify(watchHistory);
    watchHistoryWriteQueue.current = watchHistoryWriteQueue.current.then(() => {
      if (watchHistoryWritable.current) return AsyncStorage.setItem(VIDEO_WATCH_HISTORY_KEY, snapshot);
    }).catch(() => {
      watchHistoryWritable.current = false;
      Alert.alert('Could not save video history', 'Last-played times will not persist until the app can write local storage.');
    });
  }, [watchHistory, watchHistoryLoaded]);
  const onAssetChange = useCallback((slot: number, next: VideoAsset) => {
    activeAssetsRef.current.set(slot, next);
    videoProgressBySlot.current[slot] = { currentTime: 0, duration: 0 };
    setLiveSlots((current) => ({ ...current, [slot]: next }));
  }, []);
  const getNextVideoForQuadrant = useCallback((slot: number, currentId: string) => {
    const playingElsewhere = new Set([...activeAssetsRef.current.entries()]
      .filter(([otherSlot]) => otherSlot !== slot).map(([, asset]) => asset.id));
    return pickNextVideo(pool, currentId, playingElsewhere);
  }, [pool]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setAppIsActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  const isPlaybackActive = hasVideos && globalPlaying && !pipClosed &&
    (appIsActive || inPip) && [...playingQuadrants].some((id) => id.startsWith(`${session}-`));
  const viewing = useViewingSessions(isPlaybackActive);
  useEffect(() => {
    if (liveHeartRate.bpm !== null && liveHeartRate.sampleId) viewing.recordHeartRate(liveHeartRate.bpm, liveHeartRate.sampleId);
  }, [liveHeartRate.bpm, liveHeartRate.sampleId, viewing.recordHeartRate]);
  useEffect(() => {
    if (!isPlaybackActive) return;
    setClockNow(Date.now());
    const timer = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isPlaybackActive]);
  const sessionElapsedMs = viewing.store.active ? elapsedViewingTime(viewing.store.active, clockNow) : 0;
  const playerRpg = usePlayerRpg(isPlaybackActive, viewing.xp, viewing.ready);
  const recordVideoStarted = useCallback((videoId: string) => {
    if (viewing.ready && viewing.store.active) void viewing.recordVideosWatched([videoId]);
    playerRpg.recordVideosWatched([videoId]);
  }, [playerRpg.recordVideosWatched, viewing.ready, viewing.store.active?.id, viewing.recordVideosWatched]);
  useEffect(() => {
    if (!viewing.ready || !viewing.store.active) return;
    const prefix = `${session}-`;
    const activeVideoIds = [...playingQuadrants].flatMap((playbackId) => {
      if (!playbackId.startsWith(prefix)) return [];
      const slot = Number(playbackId.slice(prefix.length));
      const id = Number.isInteger(slot) ? activeAssetsRef.current.get(slot)?.id : undefined;
      return id ? [id] : [];
    });
    if (activeVideoIds.length) {
      void viewing.recordVideosWatched(activeVideoIds);
      playerRpg.recordVideosWatched(activeVideoIds);
    }
  }, [playingQuadrants, playerRpg.recordVideosWatched, session, viewing.ready, viewing.store.active?.id, viewing.recordVideosWatched]);
  const playerRewards = usePlayerRewardsSettings();
  const frameThickness = playerRewards.settings.borderEnabled &&
    isBorderUnlocked(playerRewards.settings.borderStyle, viewing.xp, playerRewards.settings.allRewardsUnlocked)
    ? effectiveBorderThickness(playerRewards.settings.borderStyle, playerRewards.settings.borderThickness) : 0;
  const playExtras = usePlayExtrasSettings();
  const generateStoryQuest = useCallback(
    () => localStory.generateStoryQuest(playerRpg.state),
    [localStory.generateStoryQuest, playerRpg.state],
  );
  const generateStoryQuestRef = useRef(generateStoryQuest);
  generateStoryQuestRef.current = generateStoryQuest;
  const openStoryQuestCount = playerRpg.state.storyQuests.filter((quest) => !quest.claimed).length;
  const openStoryQuestCountRef = useRef(openStoryQuestCount);
  openStoryQuestCountRef.current = openStoryQuestCount;
  const autoQuestLastRun = useRef(0);
  useEffect(() => {
    if (!isPlaybackActive || !localStory.modelLoaded || !localStory.preferences.autoQuestGeneration) return;
    const timer = setInterval(() => {
      if (Date.now() - autoQuestLastRun.current < 15 * 60_000 || openStoryQuestCountRef.current >= 2 ||
        localStory.busy !== null) return;
      autoQuestLastRun.current = Date.now();
      void generateStoryQuestRef.current().then((generated) => {
        if (generated) playerRpg.addStoryQuest(generated.quest);
      }).catch(() => undefined);
    }, 30_000);
    return () => clearInterval(timer);
  }, [isPlaybackActive, localStory.busy, localStory.modelLoaded,
    localStory.preferences.autoQuestGeneration, playerRpg.addStoryQuest]);
  const [generatedCheers, setGeneratedCheers] = useState<string[]>([]);
  const [generatingCheers, setGeneratingCheers] = useState(false);
  const [generatedAchievements, setGeneratedAchievements] = useState<PlayerAchievement[]>([]);
  const [generatingAchievements, setGeneratingAchievements] = useState(false);
  const cheersSeed = playerRewards.settings.congratsText;
  const cheersSeedRef = useRef(cheersSeed);
  cheersSeedRef.current = cheersSeed;
  const cheerRevision = useRef(0);
  const cheerLines = generatedCheers.length ? [...generatedCheers, ...messagesForCongratText(cheersSeed)] : messagesForCongratText(cheersSeed);
  const congratulationsMessage = generatedCheers.length
    ? celebrationLineForMinute(generatedCheers, Math.max(0, Math.floor((viewing.milestone ?? viewing.celebration ?? 0) / 600_000) - 1))
    : congratulationsFor(cheersSeed, viewing.milestone ?? viewing.celebration ?? 0);
  const cheerStorageKey = 'goon-quest.generated-celebrations.v1';
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(AI_ACHIEVEMENTS_KEY).then((raw) => {
      if (!active) return;
      const parsed = raw ? JSON.parse(raw) as unknown : [];
      setGeneratedAchievements(parseGeneratedAchievements(parsed));
    }).catch(() => {
      if (active) Alert.alert('AI achievements unavailable', 'Generated achievements could not be loaded. Existing progress is unchanged.');
    });
    return () => { active = false; };
  }, []);
  const generateAchievementBatch = useCallback(async () => {
    if (!localStory.modelLoaded) throw new Error('Load the local storyteller first.');
    if (localStory.busy || generatingAchievements) throw new Error('The storyteller is busy. Try again later.');
    setGeneratingAchievements(true);
    try {
      const incoming = await localStory.generateAchievements(3, [...playerAchievements, ...generatedAchievements]);
      if (!incoming?.length) throw new Error('The storyteller did not return a complete achievement batch.');
      const merged = mergeGeneratedAchievements(generatedAchievements, incoming);
      await AsyncStorage.setItem(AI_ACHIEVEMENTS_KEY, JSON.stringify(merged));
      setGeneratedAchievements(merged);
    } catch (error) {
      Alert.alert('Could not forge achievements', error instanceof Error ? error.message : 'Try again after the storyteller is ready.');
    } finally {
      setGeneratingAchievements(false);
    }
  }, [generatedAchievements, generatingAchievements, localStory.busy, localStory.generateAchievements, localStory.modelLoaded]);
  useEffect(() => {
    let active = true;
    const revision = ++cheerRevision.current;
    setGeneratedCheers([]);
    AsyncStorage.getItem(cheerStorageKey).then((raw) => {
      if (!raw || !active || revision !== cheerRevision.current) return;
      const saved = JSON.parse(raw) as { seed?: string; lines?: unknown[] };
      if (saved.seed === cheersSeed && Array.isArray(saved.lines)) setGeneratedCheers(saved.lines
        .filter((line): line is string => typeof line === 'string' && line.trim().length > 0).slice(0, 32).map((line) => line.slice(0, 220)));
      else setGeneratedCheers([]);
    }).catch(() => { if (active && revision === cheerRevision.current) setGeneratedCheers([]); });
    return () => { active = false; };
  }, [cheersSeed]);
  const generateCheers = useCallback(async () => {
    if (!localStory.modelLoaded) throw new Error('Load a local storyteller model first.');
    if (localStory.busy || generatingCheers) throw new Error('The storyteller is busy. Try again once it finishes.');
    ++cheerRevision.current;
    setGeneratingCheers(true);
    try {
      const incoming = await localStory.generateCelebrations(cheersSeed);
      if (cheersSeedRef.current !== cheersSeed) throw new Error('Your seed text changed. Generate again for the new text.');
      const fresh = mergeGeneratedCheers(cheersSeed, incoming);
      if (!fresh.length) throw new Error('No new usable notes returned. Check the storyteller error or try generating again.');
      const lines = mergeGeneratedCheers(cheersSeed, fresh, generatedCheers);
      if (!fresh.some((line) => !generatedCheers.includes(line))) throw new Error('The model repeated saved notes. Try again for new ones.');
      await AsyncStorage.setItem(cheerStorageKey, JSON.stringify({ seed: cheersSeed, lines }));
      if (cheersSeedRef.current === cheersSeed) setGeneratedCheers(lines);
    } finally { setGeneratingCheers(false); }
  }, [cheersSeed, generatedCheers, generatingCheers, localStory.busy, localStory.generateCelebrations, localStory.modelLoaded]);
  const autoCheerLastRun = useRef(0);
  useEffect(() => {
    if (!isPlaybackActive || !localStory.modelLoaded || !localStory.preferences.autoCheerGeneration) return;
    const timer = setInterval(() => {
      if (generatedCheers.length >= 5 || generatingCheers || localStory.busy !== null ||
        Date.now() - autoCheerLastRun.current < 30 * 60_000) return;
      autoCheerLastRun.current = Date.now();
      void generateCheers().catch(() => undefined);
    }, 30_000);
    return () => clearInterval(timer);
  }, [generateCheers, generatedCheers.length, generatingCheers, isPlaybackActive, localStory.busy,
    localStory.modelLoaded, localStory.preferences.autoCheerGeneration]);
  const lastSpokenCelebration = useRef<string | null>(null);
  const speakDialogue = useCallback((message: string) => {
    if (!playExtras.ready || !playExtras.settings.speakDialogue || !message.trim()) return;
    Speech.stop();
    Speech.speak(message, { rate: 0.96, pitch: 1.02 });
  }, [playExtras.ready, playExtras.settings.speakDialogue]);
  useEffect(() => {
    const celebration = viewing.milestone ?? viewing.celebration;
    if (!playExtras.ready || !playExtras.settings.speakCelebrations || celebration === null) return;
    const celebrationKey = `${session}:${celebration}`;
    if (celebrationKey === lastSpokenCelebration.current) return;
    lastSpokenCelebration.current = celebrationKey;
    Speech.stop();
    Speech.speak(congratulationsMessage, { rate: 0.96, pitch: 1.02 });
  }, [congratulationsMessage, playExtras.ready, playExtras.settings.speakCelebrations,
    session, viewing.celebration, viewing.milestone]);
  const controls = useAutoHideControls(hasVideos, activePanel !== null || isPicking || sessionBusy, controlsHideSeconds);
  useEffect(() => {
    if (pipClosed) setGlobalPlaying(false);
  }, [pipClosed]);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((storedTheme) => {
        if (mounted && isThemeId(storedTheme)) setThemeId(storedTheme);
      })
      .catch(() => {
        Alert.alert(
          'Theme settings unavailable',
          'The selected theme could not be loaded. The default theme is active.',
        );
      })
      .finally(() => {
        if (mounted) setThemeLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!themeLoaded) return;
    AsyncStorage.setItem(THEME_STORAGE_KEY, themeId).catch(() => {
      Alert.alert(
        'Could not save theme',
        'This theme will be used until the app is restarted.',
      );
    });
  }, [themeId, themeLoaded]);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.multiGet([NORMALIZE_STORAGE_KEY, SYNC_STORAGE_KEY, VIDEO_FILL_STORAGE_KEY, CONTROLS_DELAY_STORAGE_KEY])
      .then(([normalizeEntry, syncEntry, fillEntry, controlsEntry]) => {
        if (!mounted) return;
        if (normalizeEntry[1] !== null) {
          setNormalizeEnabled(normalizeEntry[1] === 'true');
        }
        if (syncEntry[1] !== null) {
          setSyncEnabled(syncEntry[1] === 'true');
        }
        if (fillEntry[1] !== null) {
          setFillVideos(fillEntry[1] === 'true');
        }
        setControlsHideSeconds(parseControlsHideSeconds(controlsEntry[1]));
      })
      .catch(() => {
        Alert.alert(
          'Audio settings unavailable',
          'Default volume settings will be used.',
        );
      })
      .finally(() => {
        if (mounted) setPlaybackSettingsLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!playbackSettingsLoaded) return;
    AsyncStorage.multiSet([
      [NORMALIZE_STORAGE_KEY, String(normalizeEnabled)],
      [SYNC_STORAGE_KEY, String(syncEnabled)],
      [VIDEO_FILL_STORAGE_KEY, String(fillVideos)],
    ]).catch(() => {
      Alert.alert(
        'Could not save audio settings',
        'These settings will reset when the app is restarted.',
      );
    });
  }, [normalizeEnabled, playbackSettingsLoaded, syncEnabled, fillVideos]);

  useEffect(() => {
    if (!playbackSettingsLoaded) return;
    AsyncStorage.setItem(CONTROLS_DELAY_STORAGE_KEY, String(controlsHideSeconds)).catch(() => {
      Alert.alert('Could not save controls setting', 'The auto-hide delay will reset when the app is restarted.');
    });
  }, [controlsHideSeconds, playbackSettingsLoaded]);

  const startStreams = useCallback((videos: VideoAsset[]) => {
    if (videos.length === 0) {
      Alert.alert('No videos found', 'Choose a folder or select video files.');
      return;
    }
    setSingleStreamIndex(null);
    setQuestVisible(false);
    if (!watchHistoryLoaded) {
      Alert.alert('Video history is loading', 'Wait a moment, then choose the videos again.');
      return;
    }
    const library = applyVideoWatchHistory(videos, watchHistoryRef.current);
    const selection = pickInitialVideos(library);
    activeAssetsRef.current = new Map(selection.map((asset, index) => [index, asset]));
    setPool(library);
    setRestoredStreams(null);
    setLiveSlots({});
    setActiveVideos(selection);
    setSession((current) => current + 1);
    setGlobalPlaying(true);
  }, [watchHistoryLoaded]);

  const chooseVideoFiles = async () => {
    setIsPicking(true);
    try {
      const result = await pickMediaFiles();
      if (!result.canceled && result.assets) {
        const videos = result.assets
          .filter(isVideoFile)
          .map((item) => ({
            id: item.uri,
            name: item.name,
            uri: item.uri,
          }));
        if (videos.length === 0) {
          Alert.alert(
            'No videos selected',
            'Choose one or more video files to start playback.',
          );
        } else {
          setSourceLabel('Selected videos');
          startStreams(videos);
          const ignored = result.assets.length - videos.length;
          if (ignored > 0) {
            Alert.alert('Some files were not added', `${ignored} selected file(s) were not recognized as video files.`);
          }
        }
      }
    } catch (error) {
      Alert.alert(
        'Could not open files',
        error instanceof Error ? error.message : 'Please try selecting the videos again.',
      );
    } finally {
      setIsPicking(false);
    }
  };

  const chooseDirectoryTree = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert(
        'Folder access is Android-only',
        'On this device, choose video files instead.',
      );
      return;
    }
    setIsPicking(true);
    try {
      const permission =
        await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permission.granted) return;

      const { videos, unreadableSubfolders } = await scanFolderForVideos(
        permission.directoryUri,
      );

      if (videos.length === 0) {
        Alert.alert(
          'No videos found',
          unreadableSubfolders > 0
            ? 'No supported videos were found in the folders the app could read.'
            : 'Choose a folder tree that contains supported videos.',
        );
      } else {
        setSourceLabel('Folder');
        startStreams(videos);
        if (unreadableSubfolders > 0) {
          Alert.alert(
            'Some subfolders were skipped',
            `Started playback with ${videos.length} videos. ${unreadableSubfolders} subfolder${unreadableSubfolders === 1 ? ' was' : 's were'} unavailable.`,
          );
        }
      }
    } catch (error) {
      Alert.alert(
        'Could not read folder',
        error instanceof Error ? error.message : 'Please choose the folder again.',
      );
    } finally {
      setIsPicking(false);
    }
  };

  const openAppSettings = () => {
    void Linking.openSettings().catch(() => {
      Alert.alert('Could not open Settings', 'Open Android Settings → Apps → Goon Quest → Permissions.');
    });
  };

  const chooseDownloadsVideos = async () => {
    setIsPicking(true);
    try {
      const result = await readDownloadsVideos();
      if (result.access === 'denied') {
        Alert.alert(
          'Video access needed',
          'Allow video access in Android Settings to load the Downloads pool. You can also select individual files without granting library access.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Select files', onPress: () => void chooseVideoFiles() },
            { text: 'Open Settings', onPress: openAppSettings },
          ],
        );
        return;
      }
      const videos = result.videos.filter(isVideoFile).map((video) => ({
        id: video.uri, name: video.name, uri: video.uri,
      }));
      if (videos.length === 0) {
        Alert.alert(
          'No Downloads videos available',
          result.access === 'limited'
            ? 'Android is sharing only selected videos, and none are in Downloads. Allow all videos in Settings, or select individual files.'
            : 'Android has not indexed any accessible videos in Downloads or its subfolders. Select individual files to open videos that are not in the library.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Select files', onPress: () => void chooseVideoFiles() },
            ...(result.access === 'limited' ? [{ text: 'Open Settings', onPress: openAppSettings }] : []),
          ],
        );
        return;
      }
      setSourceLabel(result.access === 'limited' ? 'Downloads · selected access' : 'Downloads');
      startStreams(videos);
      if (result.access === 'limited') {
        Alert.alert(
          'Selected video access',
          'The Downloads pool includes only videos you allowed Android to share. To include all Downloads videos, allow all videos in the app’s Android permissions.',
          [{ text: 'Continue' }, { text: 'Open Settings', onPress: openAppSettings }],
        );
      }
    } catch (error) {
      Alert.alert(
        'Could not read Downloads',
        error instanceof Error ? error.message : 'Please check video access in Android Settings.',
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Select files', onPress: () => void chooseVideoFiles() }],
      );
    } finally {
      setIsPicking(false);
    }
  };

  const chooseVideoFolder = () => {
    if (Platform.OS !== 'android') {
      void chooseDirectoryTree();
      return;
    }
    setIsPicking(true);
    Alert.alert(
      'Choose video folder',
      'Android blocks the Downloads root in its folder picker. Use Downloads to read its video library, or choose another folder normally.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setIsPicking(false) },
        { text: 'Other folder', onPress: () => void chooseDirectoryTree() },
        { text: 'Downloads', onPress: () => void chooseDownloadsVideos() },
      ],
      { cancelable: true, onDismiss: () => setIsPicking(false) },
    );
  };

  const removeFromPool = (asset: VideoAsset) => {
    const remaining = pool.filter((item) => item.id !== asset.id);
    setPool(remaining);
    if (remaining.length === 0) {
      activeAssetsRef.current.clear();
      setActiveVideos([]);
      setLiveSlots({});
      setGlobalPlaying(false);
      void viewing.finishSession();
      return;
    }
  };

  const toggleAll = () => setGlobalPlaying((playing) => !playing);
  const openTownHub = () => {
    setGlobalPlaying(false);
    setQuestVisible(false);
    setActivePanel(null);
    setTownHubVisible(true);
  };

  const stopPlayback = () => {
    activeAssetsRef.current.clear();
    setActiveVideos([]);
    setLiveSlots({});
    setGlobalPlaying(false);
    setSingleStreamIndex(null);
    void viewing.finishSession();
  };

  const captureSession = (): SessionSnapshot => {
    if (!registry.captureAudio) throw new Error('The audio mixer is still preparing. Please try saving again.');
    const streams = activeVideos.map((_, index) => {
      const capture = registry.videos.get(index);
      if (!capture) throw new Error('A quadrant is still preparing. Please try saving again.');
      const stream = capture();
      if (!pool.some((item) => item.uri === stream.asset.uri)) {
        throw new Error('A quadrant is changing files. Please try saving again.');
      }
      return stream;
    });
    return {
      version: 1, savedAt: new Date().toISOString(), pool, streams,
      audio: registry.captureAudio(), sourceLabel, globalPlaying, slideshow: captureSlideshow(),
      ...(!online.storageError ? { sources: online.sources } : {}),
      settings: { themeId, normalize: normalizeEnabled, sync: syncEnabled, fill: fillVideos,
        controlsDelay: controlsHideSeconds, sharedVolume, sound },
    };
  };
  const restoreSession = async (saved: SessionSnapshot) => {
    if (!registry.restoreAudio) throw new Error('The audio mixer is still preparing. Please try resuming again.');
    if (saved.sources) await online.restoreSources(saved.sources);
    const s = saved.settings;
    setThemeId(isThemeId(s.themeId) ? s.themeId : 'amethyst');
    setNormalizeEnabled(s.normalize);
    setSyncEnabled(s.sync);
    setFillVideos(s.fill);
    setControlsHideSeconds(s.controlsDelay);
    setSharedVolume(s.sharedVolume);
    setSound(s.sound);
    restoreSlideshow(saved.slideshow ?? { ...DEFAULT_SLIDESHOW, pool: [] });
    setSourceLabel(saved.sourceLabel);
    const restoredPool = applyVideoWatchHistory(saved.pool, watchHistoryRef.current);
    const streams = saved.streams.map((stream) => ({
      ...stream, asset: applyVideoWatchHistory([stream.asset], watchHistoryRef.current)[0],
    }));
    activeAssetsRef.current = new Map(streams.map((stream, index) => [index, stream.asset]));
    setPool(restoredPool);
    setRestoredStreams(streams);
    setActiveVideos(streams.map((stream) => stream.asset));
    setLiveSlots({});
    setGlobalPlaying(saved.globalPlaying);
    setSingleStreamIndex(null);
    registry.restoreAudio(saved.audio);
    setSession((current) => current + 1);
    setActivePanel(null);
  };

  const exportGoonQuestBackup = async () => {
    try {
      let savedSession: SessionSnapshot | null = null;
      if (pool.length || backgroundTrackCount > 0 || slideshow.pool.length > 0) {
        savedSession = captureSession();
      } else {
        const previous = await AsyncStorage.getItem(SESSION_KEY);
        if (previous) savedSession = parseSession(previous);
      }
      const backup = createGoonQuestBackup({
        appVersion: '1.13.0',
        exportedAt: new Date().toISOString(),
        session: savedSession,
        progress: {
          rpg: playerRpg.state,
          viewing: viewing.store,
          rewards: playerRewards.settings,
          videoWatchHistory: watchHistory,
          themeId,
          playExtras: playExtras.settings,
          playbackSettings: {
            normalize: normalizeEnabled,
            sync: syncEnabled,
            fill: fillVideos,
            controlsDelay: controlsHideSeconds,
            sharedVolume,
            sound,
          },
        },
      });
      const json = JSON.stringify(backup, null, 2);
      if (json.length > MAX_BACKUP_CHARS) throw new Error('This backup is too large to export safely.');
      const access = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!access.granted) return;
      const filename = `GoonQuest-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      const uri = await FileSystem.StorageAccessFramework.createFileAsync(
        access.directoryUri, filename, 'application/json',
      );
      await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 });
      Alert.alert('Backup exported', 'Your RPG progress, playback settings, and saved session were written as a JSON file.');
    } catch (error) {
      Alert.alert('Could not export backup', error instanceof Error ? error.message : 'Please choose another folder and try again.');
    }
  };

  const applyGoonQuestBackup = async (backup: ReturnType<typeof parseGoonQuestBackup>) => {
    try {
      const entries: [string, string][] = [
        [PLAYER_RPG_KEY, JSON.stringify(backup.progress.rpg)],
        [VIEWING_SESSIONS_KEY, JSON.stringify(backup.progress.viewing)],
        [PLAYER_REWARDS_KEY, JSON.stringify(backup.progress.rewards)],
        [VIDEO_WATCH_HISTORY_KEY, JSON.stringify(backup.progress.videoWatchHistory)],
        [PLAY_EXTRAS_KEY, JSON.stringify(backup.progress.playExtras)],
        [THEME_STORAGE_KEY, backup.progress.themeId],
        [NORMALIZE_STORAGE_KEY, String(backup.progress.playbackSettings.normalize)],
        [SYNC_STORAGE_KEY, String(backup.progress.playbackSettings.sync)],
        [VIDEO_FILL_STORAGE_KEY, String(backup.progress.playbackSettings.fill)],
        [CONTROLS_DELAY_STORAGE_KEY, String(backup.progress.playbackSettings.controlsDelay)],
      ];
      if (backup.session) entries.push([SESSION_KEY, JSON.stringify(backup.session)]);
      await AsyncStorage.multiSet(entries);
      if (!backup.session) await AsyncStorage.removeItem(SESSION_KEY);
      if (!playerRpg.replaceState(backup.progress.rpg)) throw new Error('RPG data is not ready to restore yet.');
      if (!await viewing.restoreStore(backup.progress.viewing)) throw new Error('Session history is not ready to restore yet.');
      if (!playExtras.restore(backup.progress.playExtras)) throw new Error('Game audio settings are not ready to restore yet.');
      playerRewards.update(backup.progress.rewards);
      watchHistoryRef.current = backup.progress.videoWatchHistory;
      watchHistoryWritable.current = true;
      setWatchHistory(backup.progress.videoWatchHistory);
      setPool((current) => applyVideoWatchHistory(current, backup.progress.videoWatchHistory));
      setThemeId(backup.progress.themeId as ThemeId);
      setNormalizeEnabled(backup.progress.playbackSettings.normalize);
      setSyncEnabled(backup.progress.playbackSettings.sync);
      setFillVideos(backup.progress.playbackSettings.fill);
      setControlsHideSeconds(backup.progress.playbackSettings.controlsDelay);
      setSharedVolume(backup.progress.playbackSettings.sharedVolume);
      setSound(backup.progress.playbackSettings.sound);
      setGlobalPlaying(false);
      setSingleStreamIndex(null);
      setSessionListRevision((current) => current + 1);
      Alert.alert(
        'Backup imported',
        backup.session
          ? 'Your progress and saved session are restored. Resume the session from the toolbar; Android may ask you to reconnect media files.'
          : 'Your progress and settings are restored. No saved media session was included in this backup.',
      );
    } catch (error) {
      Alert.alert('Could not import backup', error instanceof Error ? error.message : 'Your data was not fully restored.');
    }
  };

  const importGoonQuestBackup = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets[0]) return;
      if (typeof result.assets[0].size === 'number' && result.assets[0].size > MAX_BACKUP_CHARS) {
        throw new Error('This backup is too large to import safely.');
      }
      const raw = await FileSystem.readAsStringAsync(result.assets[0].uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const backup = parseGoonQuestBackup(raw);
      Alert.alert(
        'Replace local progress?',
        `This imports the ${backup.appVersion} backup and replaces current RPG progress, viewing history, themes, and the saved session. Export a backup first if you want to keep the current data.${backup.session ? '\n\nThe media files are not copied into the JSON; Android storage access may need to be reconnected.' : ''}`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Import backup', style: 'destructive', onPress: () => void applyGoonQuestBackup(backup) },
        ],
      );
    } catch (error) {
      Alert.alert('Could not read backup', error instanceof Error ? error.message : 'Select a valid Goon Quest JSON backup.');
    }
  };

  return (
    <ColorContext.Provider value={colors}>
    <SafeAreaView
      edges={hasVideos ? [] : ['top', 'bottom', 'left', 'right']}
      style={[
        styles.safeArea,
        { backgroundColor: colors.background },
        Platform.OS === 'web' && !hasVideos && styles.webSafeArea,
      ]}
    >
      <StatusBar hidden />
      <NavigationBar hidden={hasVideos} style="light" />
      <View
        pointerEvents={sessionBusy ? 'none' : 'auto'}
        style={[styles.screen, !hasVideos && styles.browserScreen]}
        onTouchStart={controls.hold}
        onTouchEnd={(event) => {
          if (event.nativeEvent.touches.length === 0) controls.release();
        }}
        onTouchCancel={controls.release}
      >
        <FadingControls visible={!inPip && (!hasVideos || controls.visible)} style={hasVideos ? [
          styles.toolbarOverlay,
          {
            backgroundColor: colors.playbackOverlay,
            paddingTop: insets.top,
            paddingLeft: Math.max(12, insets.left),
            paddingRight: Math.max(12, insets.right),
          },
        ] : styles.browserToolbar}>
        <View pointerEvents="box-none" style={[styles.topBar, { borderBottomColor: colors.border }]}>
          <View pointerEvents="none" style={styles.brandBlock}>
            <PixelFamiliar size={44} motion={false} label="Goon Quest pixel familiar" />
            <View>
              <Text style={[styles.brandName, { color: colors.foreground, fontFamily: 'Pixelta' }]}>
                GOON QUEST
              </Text>
              <Text style={[styles.brandMeta, { color: colors.mutedForeground }]}>
                {pool.length > 0
                  ? `${pool.length} ${pool.length === 1 ? 'clip' : 'clips'} in your den · ${sourceLabel}`
                  : 'PIXEL FANTASY · FAMILIARS · QUESTS'}
                {backgroundTrackCount > 0 ? ` · ${backgroundTrackCount} audio` : ''}
              </Text>
            </View>
          </View>

          <View pointerEvents="box-none" style={styles.topActions}>
            <ActionButton compact icon="clock" label="Timer and leaderboards"
              onPress={() => setStandingsVisible(true)} />
            <ActionButton compact icon="message-circle" label="Chat with Pawstar"
              onPress={() => setChatVisible((current) => !current)} />
            <ActionButton compact icon="bar-chart-2" label="Stats overlay settings"
              onPress={() => setStatsVisible(true)} />
            <SessionControls
              key={sessionListRevision}
              capture={captureSession} restore={restoreSession}
              canSave={pool.length > 0 || backgroundTrackCount > 0 || slideshow.pool.length > 0}
              hasCurrent={pool.length > 0 || backgroundTrackCount > 0 || slideshow.pool.length > 0}
              disabled={isPicking || inPip || !themeLoaded || !playbackSettingsLoaded || !soundLoaded || !online.loaded}
              compact={hasVideos} onBusyChange={setSessionBusy}
            />
            {activeVideos.length > 0 ? (
              <>
                <ActionButton
                  compact
                  icon="folder"
                  label="Choose a folder"
                  onPress={() => void chooseVideoFolder()}
                  disabled={isPicking}
                />
                <ActionButton
                  compact
                  icon="film"
                  label="Choose video files"
                  onPress={() => void chooseVideoFiles()}
                  disabled={isPicking}
                />
                <ActionButton
                  compact
                  icon="shuffle"
                  label="Shuffle all four streams"
                  onPress={() => startStreams(pool)}
                  disabled={isPicking || pool.length === 0}
                />
                {singleStreamIndex !== null && (
                  <ActionButton
                    compact
                    icon="grid"
                    label="Return to quad stream"
                    onPress={() => setSingleStreamIndex(null)}
                  />
                )}
                <ActionButton
                  compact
                  icon="minimize-2"
                  label="Picture in picture · all four videos"
                  onPress={() => void enterPip()}
                  disabled={isPicking || inPip || Platform.OS !== 'android'}
                />
                <ActionButton
                  compact
                  icon={globalPlaying ? 'pause' : 'play'}
                  label={singleStreamIndex === null
                    ? (globalPlaying ? 'Pause all videos' : 'Play all videos')
                    : (globalPlaying ? 'Pause focused video' : 'Play focused video')}
                  onPress={toggleAll}
                />
                <ActionButton
                  compact
                  icon="square"
                  label="Stop video playback"
                  onPress={stopPlayback}
                />
              </>
            ) : (
              <>
                <ActionButton
                  icon="folder"
                  label="Choose folder"
                  onPress={() => void chooseVideoFolder()}
                  disabled={isPicking}
                />
                <ActionButton
                  icon="film"
                  label="Choose videos"
                  onPress={() => void chooseVideoFiles()}
                  disabled={isPicking}
                  primary
                />
              </>
            )}
            <ActionButton
              compact
              icon="music"
              label={`Background audio: ${backgroundTrackCount} ${backgroundTrackCount === 1 ? 'track' : 'tracks'}`}
              onPress={() => setActivePanel('audio')}
            />
            <ActionButton
              compact
              icon="home"
              label="Open town and guild hub"
              onPress={openTownHub}
            />
            {pool.length > 0 && (
              <ActionButton
                compact
                icon="list"
                label={`View ${pool.length} selected videos`}
                onPress={() => setActivePanel('pool')}
              />
            )}
            <ActionButton
              compact
              icon="settings"
              label="Settings"
              onPress={() => {
                setSettingsCategory(null);
                setActivePanel('settings');
              }}
            />
          </View>
        </View>
        </FadingControls>

        {activeVideos.length > 0 ? (
          <View style={[styles.grid, { padding: frameThickness, rowGap: frameThickness }]}>
            {[0, 1].map((row) => (
            <View key={row} style={[
              styles.gridRow,
              { columnGap: frameThickness },
              singleStreamIndex !== null && Math.floor(singleStreamIndex / 2) !== row && styles.hiddenGridRow,
            ]}>
            {activeVideos.slice(row * 2, row * 2 + 2).map((asset, column) => {
              const index = row * 2 + column;
              const playbackId = `${session}-${index}`;
              return (
                <VideoTile
                  key={playbackId}
                  asset={asset}
                  pool={pool}
                  index={index}
                  bpmByVideoId={videoBpmById}
                  playbackId={playbackId}
                  onPlaybackStateChange={reportQuadrantPlayback}
                  onVideoStarted={recordVideoStarted}
                  getNextVideo={getNextVideoForQuadrant}
                  onAssetChange={onAssetChange}
                  onPlaybackProgress={reportVideoProgress}
                  onPlaybackEnded={reportVideoEnded}
                  stopAtEnd={bossVideoIndex === index}
                  globalPlaying={globalPlaying}
                  normalizeLoudness={audioMode === 'normalized'}
                  linkedVolume={audioMode === 'shared'}
                  sharedVolume={sharedVolume}
                  onSharedVolumeChange={setSharedVolume}
                  fillVideos={fillVideos}
                  focusIndex={singleStreamIndex}
                  tileVisible={singleStreamIndex === null || singleStreamIndex === index}
                  onToggleFocus={(slot) => setSingleStreamIndex((current) => current === slot ? null : slot)}
                  controlsVisible={!inPip && controls.visible && !combatActive}
                  controlsEnabled={!combatActive}
                  onToggleControls={controls.toggle}
                  initialSnapshot={restoredStreams?.[index]}
                />
              );
            })}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <LinearGradient
              colors={[colors.accent, colors.card]}
              style={styles.emptyMark}
            >
              <PixelFamiliar size={124} motion />
            </LinearGradient>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              Your next little legend starts here.
            </Text>
            <Text style={[styles.emptyDescription, { color: colors.mutedForeground }]}>
              Choose the clips for your den, then take on quests while the streams
              play independently. Add a bouncing slideshow and background audio
              whenever you want to make the guild feel like yours.
              {'\n'}MP4, WebM, MOV, MKV and other common containers.
              {'\n'}Codec support depends on your Android device.
            </Text>
            <View style={styles.emptyActions}>
              <ActionButton
                icon="folder"
                label="Choose folder"
                onPress={() => void chooseVideoFolder()}
                disabled={isPicking}
              />
              <ActionButton
                icon="film"
                label="Choose videos"
                onPress={() => void chooseVideoFiles()}
                disabled={isPicking}
                primary
              />
            </View>
            {isPicking && (
              <View style={styles.pickingStatus}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.videoStatusText, { color: colors.mutedForeground }]}>
                  Opening your files
                </Text>
              </View>
            )}
            <Text style={[styles.supportNote, { color: colors.mutedForeground }]}>
              Wide-tablet friendly · pixel quests · your own clip collection
            </Text>
          </View>
        )}
        <ScreenBorder
          enabled={playerRewards.settings.borderEnabled}
          styleId={playerRewards.settings.borderStyle}
          scroll={playerRewards.settings.scrollBorder}
          direction={playerRewards.settings.scrollDirection}
          speed={playerRewards.settings.scrollSpeed}
          textureScale={playerRewards.settings.textureScale}
          pawSpacing={playerRewards.settings.pawSpacing}
          thickness={playerRewards.settings.borderThickness}
          xp={viewing.xp}
          allRewardsUnlocked={playerRewards.settings.allRewardsUnlocked}
          layout={singleStreamIndex !== null ? 'single' : 'quad'}
        />
        <SlideshowOverlay active={hasVideos && !pipClosed} />
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 60 }]}>
          <SessionStatsOverlay
            elapsedMs={sessionElapsedMs}
            heartRate={liveHeartRate.bpm}
            recordedHeartRate={viewing.store.active?.heartRate}
            videosWatched={viewing.store.active?.watchedVideoIds.length ?? 0}
            lifetimeVideosWatched={(viewing.store.totalVideosWatched ?? 0) +
              (viewing.store.active?.watchedVideoIds.length ?? 0)}
            poolSize={pool.length}
            averageBpm={averageVideoBpm(liveVideos.filter((_, slot) => singleStreamIndex === null || singleStreamIndex === slot)
              .map((asset) => videoBpmById[asset.id]))}
            isPlaying={isPlaybackActive}
            settingsVisible={statsVisible}
            onCloseSettings={() => setStatsVisible(false)}
          />
        </View>
        <ViewingSessionTimer
          open={standingsVisible}
          onClose={() => setStandingsVisible(false)}
          showButton={false}
          showMinuteCheers={playerRewards.settings.minuteCheersEnabled}
          celebrationLines={cheerLines}
          onGenerateCelebrations={generateCheers}
          generatingCelebrations={generatingCheers || localStory.busy !== null}
          generatedAchievements={generatedAchievements}
          onGenerateAchievements={generateAchievementBatch}
          generatingAchievements={generatingAchievements || localStory.busy !== null}
          store={viewing.store}
          totalVideoCount={pool.length}
          visible={hasVideos || !!viewing.store.active || viewing.store.leaderboard.length > 0 || viewing.store.totalPlaybackMs > 0 || !!viewing.error}
          ready={viewing.ready}
          error={viewing.error}
          isPlaying={isPlaybackActive}
          celebration={viewing.celebration}
          milestone={viewing.milestone}
          xp={viewing.xp}
          congratsMessage={congratulationsMessage}
          finishRecap={viewing.finishRecap}
          onMilestoneDone={() => viewing.setMilestone(null)}
          onCelebrateDone={() => viewing.setCelebration(null)}
          onRecapDismiss={() => viewing.setFinishRecap(null)}
          onEndSession={viewing.finishSession}
          onRetry={() => void viewing.retryStorage()}
        />
        <KeyJingleOverlay
          enabled={playExtras.settings.keysEnabled}
          playing={isPlaybackActive}
          repeatSeconds={playExtras.settings.keyRepeatSeconds}
        />
        {hasVideos && !inPip && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open quests and image dungeon"
            onPress={() => setQuestVisible(true)}
            style={[
              styles.questFab,
              {
                left: Math.max(14, insets.left + 10),
                bottom: Math.max(14, insets.bottom + 10),
                backgroundColor: colors.primary,
                borderColor: colors.primaryForeground,
              },
            ]}
          >
            <Feather name="compass" size={17} color={colors.primaryForeground} />
            <Text style={[styles.questFabText, { color: colors.primaryForeground }]}>Quests</Text>
          </Pressable>
        )}
      </View>
      <Modal
        visible={activePanel === 'settings'}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (settingsCategory !== null) setSettingsCategory(null);
          else closeSettings();
        }}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalPanel,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={styles.settingsHeading}>
                {settingsCategory !== null && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Back to settings categories"
                    onPress={() => setSettingsCategory(null)}
                    style={styles.settingsBackButton}
                  >
                    <Feather name="chevron-left" size={21} color={colors.foreground} />
                  </Pressable>
                )}
                <View style={styles.settingCopy}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  {selectedSettingsCategory?.title ?? 'Settings'}
                </Text>
                <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
                  {selectedSettingsCategory?.description ?? 'Choose a category to find each setting quickly.'}
                </Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close settings"
                onPress={closeSettings}
                style={styles.modalClose}
              >
                <Feather name="x" size={20} color={colors.foreground} />
              </Pressable>
            </View>
            <KeyboardAwareScrollViewCompat
              style={styles.settingsScroll}
              contentContainerStyle={styles.settingsContent}
              bottomOffset={24}
              showsVerticalScrollIndicator
            >
            {settingsCategory === null ? (
              <View style={styles.settingsCategoryList}>
                {SETTINGS_CATEGORIES.map((category) => (
                  <Pressable
                    key={category.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${category.title}. ${category.description}`}
                    onPress={() => setSettingsCategory(category.id)}
                    style={({ pressed }) => [
                      styles.settingsCategoryCard,
                      {
                        backgroundColor: colors.secondary,
                        borderColor: colors.border,
                        opacity: pressed ? 0.78 : 1,
                      },
                    ]}
                  >
                    <View style={[styles.settingsCategoryIcon, { backgroundColor: colors.accent }]}>
                      <Feather name={category.icon} size={18} color={colors.primary} />
                    </View>
                    <View style={styles.settingCopy}>
                      <Text style={[styles.settingsCategoryTitle, { color: colors.foreground }]}>
                        {category.title}
                      </Text>
                      <Text style={[styles.settingsCategoryDescription, { color: colors.mutedForeground }]}>
                        {category.description}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
                  </Pressable>
                ))}
              </View>
            ) : (
              <>
                {settingsCategory === 'controls' && (
                  <View style={[styles.settingRow, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
                    <View style={styles.settingCopy}>
                      <Text style={[styles.settingTitle, { color: colors.foreground }]}>S Pen combat taps</Text>
                      <Text style={[styles.settingDescription, { color: colors.mutedForeground }]}>
                        {controlScheme === 'spen'
                          ? 'ON · Use the S Pen to tap dungeon enemies and boss targets. Game menus remain touch-enabled.'
                          : 'OFF · Use finger taps to attack dungeon enemies and boss targets.'}
                      </Text>
                    </View>
                    <SettingSwitch label="S Pen combat taps" value={controlScheme === 'spen'}
                      onValueChange={updateControlScheme} disabled={!controlSchemeLoaded} />
                  </View>
                )}
                {settingsCategory === 'playback' && (
                  <>
                    <View style={[styles.settingRow, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
                      <View style={styles.settingCopy}>
                        <Text style={[styles.settingTitle, { color: colors.foreground }]}>Normalize volume</Text>
                        <Text style={[styles.settingDescription, { color: colors.mutedForeground }]}>
                          {normalizeEnabled
                            ? (syncEnabled ? 'ON · Shared volume sliders are active.' : 'ON · Live loudness processing is active.')
                            : 'OFF · Original audio with independent volume sliders.'}
                        </Text>
                      </View>
                      <SettingSwitch label="Normalize volume" value={normalizeEnabled}
                        onValueChange={setNormalizeEnabled} disabled={Platform.OS !== 'android'} />
                    </View>
                    {normalizeEnabled && (
                      <View style={[styles.settingRow, styles.syncSettingRow,
                        { borderColor: colors.border, backgroundColor: colors.secondary }]}>
                        <View style={styles.settingCopy}>
                          <Text style={[styles.settingTitle, { color: colors.foreground }]}>Sync</Text>
                          <Text style={[styles.settingDescription, { color: colors.mutedForeground }]}>
                            {syncEnabled
                              ? 'ON · One shared slider level for all videos.'
                              : 'OFF · True per-video loudness normalization.'}
                          </Text>
                        </View>
                        <SettingSwitch label="Sync video volume sliders" value={syncEnabled}
                          onValueChange={setSyncEnabled} />
                      </View>
                    )}
                    <View style={[styles.settingRow, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
                      <View style={styles.settingCopy}>
                        <Text style={[styles.settingTitle, { color: colors.foreground }]}>Fill video quarters</Text>
                        <Text style={[styles.settingDescription, { color: colors.mutedForeground }]}>
                          {fillVideos
                            ? 'Fill · Covers each quarter, cropping edges as needed.'
                            : 'Fit · Shows the whole video with black bars as needed.'}
                        </Text>
                      </View>
                      <SettingSwitch label="Fill video quarters" value={fillVideos} onValueChange={setFillVideos} />
                    </View>
                    <ControlsTimeoutSetting value={controlsHideSeconds} onChange={setControlsHideSeconds}
                      disabled={!playbackSettingsLoaded} />
                  </>
                )}
                {settingsCategory === 'appearance' && (
                  <>
                    <Text style={[styles.themeSectionTitle, { color: colors.mutedForeground }]}>
                      OLED-black accent themes
                    </Text>
                    <Text style={[styles.themeDescription, { color: colors.mutedForeground }]}>
                      Each choice changes accent colors only. Trans Pride uses the flag palette; Spectrum Calm
                      uses infinity-inspired colors without puzzle-piece imagery; Stim Garden uses soft, low-glare accents.
                    </Text>
                    <View style={styles.themeGrid}>
                      {themePresets.map((theme) => {
                        const isSelected = theme.id === themeId;
                        const themeUnlocked = isThemeUnlocked(theme.id, viewing.xp,
                          playerRewards.settings.allRewardsUnlocked);
                        const selectionDisabled = !themeUnlocked && !isSelected;
                        const swatches = 'swatches' in theme ? theme.swatches : [theme.primary];
                        return (
                          <Pressable key={theme.id} accessibilityRole="radio"
                            accessibilityState={{ selected: isSelected, disabled: selectionDisabled }}
                            accessibilityLabel={`${theme.name} theme${'description' in theme ? `, ${theme.description}` : ''}`}
                            disabled={selectionDisabled} onPress={() => setThemeId(theme.id)}
                            style={[
                              styles.themeOption,
                              {
                                backgroundColor: colors.secondary,
                                borderColor: isSelected ? colors.primary : colors.border,
                                opacity: selectionDisabled ? 0.55 : 1,
                              },
                            ]}
                          >
                            <View style={styles.themeSwatch}>
                              {swatches.map((swatch, index) => (
                                <View key={`${theme.id}-${index}`}
                                  style={[styles.themeSwatchStripe, { backgroundColor: swatch }]} />
                              ))}
                            </View>
                            <View style={styles.themeText}>
                              <Text numberOfLines={1} style={[styles.themeName, { color: colors.foreground }]}>
                                {theme.name}
                              </Text>
                              {'description' in theme && (
                                <Text numberOfLines={2} style={[styles.themeDescription, { color: colors.mutedForeground }]}>
                                  {theme.description}
                                </Text>
                              )}
                              {selectionDisabled && (
                                <Text style={[styles.themeUnlock, { color: colors.mutedForeground }]}>
                                  Level {themeUnlockLevels[theme.id] ?? '?'}
                                </Text>
                              )}
                            </View>
                            {selectionDisabled && <Feather name="lock" size={13} color={colors.mutedForeground} />}
                            {isSelected && <Feather name="check" size={15} color={colors.primary} />}
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                )}
                {settingsCategory === 'audio' && (
                  <>
                    <SoundEffectsSettings xp={viewing.xp}
                      allRewardsUnlocked={playerRewards.settings.allRewardsUnlocked} />
                    <PlayExtrasSettings settings={playExtras.settings} update={playExtras.update}
                      ready={playExtras.ready} />
                  </>
                )}
                {settingsCategory === 'progression' && (
                  <>
                    <PlayerRewardsSettings settings={playerRewards.settings} update={playerRewards.update}
                      xp={viewing.xp} ready={playerRewards.ready} error={playerRewards.error}
                      onGenerateCelebrations={generateCheers}
                      generatedCelebrations={generatedCheers}
                      generatingCelebrations={generatingCheers || localStory.busy !== null} />
                    <PlayerRpgDashboard state={playerRpg.state} ready={playerRpg.ready}
                      error={playerRpg.error} onRetry={() => void playerRpg.retry()}
                      onClaimQuest={playerRpg.claimQuest} onUpgradeSkill={playerRpg.upgradeSkill}
                      onBuyItem={playerRpg.buyItem} onEquipItem={playerRpg.equipItem}
                      onSetAdultFlavor={playerRpg.setAdultFlavor}
                      onRenameCompanion={playerRpg.renameCompanion} />
                  </>
                )}
                {settingsCategory === 'story-ai' && (
                  <LocalStorySettings
                    preferences={localStory.preferences}
                    ready={localStory.preferencesReady}
                    modelLoaded={localStory.modelLoaded}
                    busy={localStory.busy}
                    loadProgress={localStory.loadProgress}
                    error={localStory.error}
                    testResult={localStory.testResult}
                    onImport={() => void localStory.importModel()}
                    onLoad={() => void localStory.loadModel()}
                    onUnload={() => void localStory.unloadModel()}
                    onRemove={localStory.removeModel}
                    onPromptChange={localStory.updatePrompt}
                    onEnemyBanterChange={localStory.setEnemyBanterEnabled}
                    onTest={() => void localStory.testPrompt()}
                    onCombatPreferenceChange={localStory.setCombatPreference}
                    onAutomationPreferenceChange={localStory.setAutomationPreference}
                  />
                )}
                {settingsCategory === 'heart-rate' && <HeartRateSettings />}
                {settingsCategory === 'media' && (
                  <>
                    <View style={[styles.backupCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                      <Text style={[styles.settingTitle, { color: colors.foreground }]}>Automatic video BPM</Text>
                      <Text style={[styles.settingDescription, { color: colors.mutedForeground }]}>
                        {automaticBpm.completed} / {automaticBpm.total} clips analyzed.
                        {automaticBpm.analyzing ? ` Scanning: ${automaticBpm.analyzing}` : ''}
                        {'\n'}One audio decoder at a time scans up to 24 seconds per clip and caches the estimate.
                        Speech, silence, unsupported audio, or an irregular beat may have no BPM.
                        Average BPM means the detected musical tempos of the visible clips, not heart rate.
                      </Text>
                      {!!automaticBpm.error && <Text style={{ color: colors.destructive }}>{automaticBpm.error}</Text>}
                      <ActionButton icon="refresh-cw" label="Rescan pool BPM" onPress={automaticBpm.rescan}
                        disabled={!pool.length} />
                    </View>
                    <ActionButton icon="globe" label="Online media sources" onPress={() => {
                      setSourcesReturn('settings');
                      setActivePanel('sources');
                    }} />
                    <ActionButton icon="image" label={`Image / GIF slideshow (${slideshow.pool.length})`}
                      onPress={() => {
                        setSlideshowReturn('settings');
                        setActivePanel('slideshow');
                      }} />
                  </>
                )}
                {settingsCategory === 'data' && (
                  <>
                    <View style={[styles.backupCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                      <Text style={[styles.settingTitle, { color: colors.foreground }]}>Backup and transfer</Text>
                      <Text style={[styles.settingDescription, { color: colors.mutedForeground }]}>
                        Export progress and the saved session as JSON. Media files are not copied; Android access may need reconnecting after transfer.
                      </Text>
                      <View style={styles.backupActions}>
                        <ActionButton icon="download" label="Export JSON" onPress={() => void exportGoonQuestBackup()}
                          disabled={!themeLoaded || !playbackSettingsLoaded || !watchHistoryLoaded || !viewing.ready ||
                            !playerRpg.ready || !playerRewards.ready || !playExtras.ready || !soundLoaded} />
                        <ActionButton icon="upload" label="Import JSON" onPress={() => void importGoonQuestBackup()}
                          disabled={!themeLoaded || !playbackSettingsLoaded || !watchHistoryLoaded || !viewing.ready ||
                            !playerRpg.ready || !playerRewards.ready || !playExtras.ready || !soundLoaded} />
                      </View>
                    </View>
                    <ActionButton icon="alert-circle" label="Last crash report" onPress={() => void showCrashReport()} />
                  </>
                )}
                {settingsCategory === 'patch-notes' && <ReleaseNotesPanel />}
              </>
            )}
            </KeyboardAwareScrollViewCompat>
          </View>
        </View>
      </Modal>
      <Modal
        visible={activePanel === 'pool'}
        transparent
        animationType="slide"
        onRequestClose={() => setActivePanel(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalPanel,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  Video pool
                </Text>
                <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
                  {pool.length} {pool.length === 1 ? 'video' : 'videos'} · Removing
                  clips here keeps the original files on your device.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close video pool"
                onPress={() => setActivePanel(null)}
                style={styles.modalClose}
              >
                <Feather name="x" size={20} color={colors.foreground} />
              </Pressable>
            </View>
            {pool.length > 0 ? (
              <FlatList
                data={pool}
                keyExtractor={(asset) => asset.id}
                style={styles.poolList}
                contentContainerStyle={styles.poolListContent}
                initialNumToRender={6}
                maxToRenderPerBatch={4}
                windowSize={3}
                showsVerticalScrollIndicator
                renderItem={({ item: asset }) => (
                  <View
                    key={asset.id}
                    style={[
                      styles.poolRow,
                      { borderBottomColor: colors.border },
                    ]}
                  >
                    <PoolVideoPreview uri={asset.uri} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={1}
                        ellipsizeMode="middle"
                        style={[styles.poolFileName, { color: colors.foreground }]}
                      >
                        {asset.name}
                      </Text>
                      <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 10 }}>
                        {formatLastPlayed(asset.lastPlayedAt)}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${asset.name} from the pool`}
                      onPress={() => removeFromPool(asset)}
                      style={({ pressed }) => [
                        styles.removeFileButton,
                        pressed && styles.pressedButton,
                      ]}
                    >
                      <Feather name="trash-2" size={17} color={colors.destructive} />
                    </Pressable>
                  </View>
                )}
              />
            ) : (
              <Text style={[styles.emptyPool, { color: colors.mutedForeground }]}>
                The pool is empty. Select files or a folder to add videos.
              </Text>
            )}
          </View>
        </View>
      </Modal>
      <SlideshowPanel visible={activePanel === 'slideshow'} onClose={() => setActivePanel(slideshowReturn === 'settings' ? 'settings' : null)}
        onManageSources={() => { setSourcesReturn('slideshow'); setActivePanel('sources'); }} />
      <OnlineSourcesPanel visible={activePanel === 'sources'}
        onSuggestEnemyTags={localStory.suggestEnemyTags}
        storytellerReady={localStory.modelLoaded}
        storytellerBusy={localStory.busy !== null}
        onClose={() => {
        if (questSourcesReturn) {
          setQuestSourcesReturn(false);
          setActivePanel(null);
          setQuestVisible(true);
        } else setActivePanel(sourcesReturn);
      }}
        onPlayVideos={(items: RemoteMedia[], name: string) => {
          const apply = () => {
            startStreams(items.map((item) => ({ id: item.uri, uri: item.uri, name: item.name })));
            setSourceLabel(name); setActivePanel(null); setQuestSourcesReturn(false);
          };
          if (pool.length) Alert.alert('Play online source videos?', 'This replaces the active video pool and restarts the four quadrants. Local files and saved sessions are not deleted.', [
            { text: 'Cancel', style: 'cancel' }, { text: 'Play source videos', onPress: apply },
          ]);
          else apply();
        }} />
      <BackgroundAudioMixer
        visible={activePanel === 'audio'}
        onClose={() => setActivePanel(null)}
        onCountChange={setBackgroundTrackCount}
      />
      <RpgTownHub
        visible={townHubVisible}
        onClose={() => setTownHubVisible(false)}
        state={playerRpg.state}
        ready={playerRpg.ready}
        error={playerRpg.error}
        onRetry={() => void playerRpg.retry()}
        onSelectClass={playerRpg.setClass}
        onClaimQuest={playerRpg.claimQuest}
        onUpgradeSkill={playerRpg.upgradeSkill}
        onBuyItem={playerRpg.buyItem}
        onEquipItem={playerRpg.equipItem}
      />
      <GoonQuestOverlay
        chatVisible={chatVisible}
        onChatClose={() => setChatVisible(false)}
        onCombatActiveChange={setCombatActive}
        videoBpmById={videoBpmById}
        onGenerateChatReply={localStory.generateChatReply}
        onGenerateHonorIdea={localStory.generateHonorIdea}
        storytellerError={localStory.error}
        onMiniGameWin={viewing.recordMiniGameWin}
        autoHonorGeneration={localStory.preferences.autoHonorGeneration}
        visible={questVisible}
        onClose={() => setQuestVisible(false)}
        pool={slideshow.pool}
        state={playerRpg.state}
        onSelectClass={playerRpg.setClass}
        onCombatProgress={playerRpg.recordCombat}
        onClaimQuest={playerRpg.claimQuest}
        onAddStoryQuest={playerRpg.addStoryQuest}
        onGenerateStoryQuest={generateStoryQuest}
        onGenerateCharacterLine={localStory.generateCharacterLine}
        storytellerReady={localStory.modelLoaded}
        storytellerBusy={localStory.busy !== null}
        enemyBanterEnabled={localStory.preferences.enemyBanterEnabled}
        combatAiEnabled={localStory.preferences.combatAiEnabled}
        combatSpeechEnabled={localStory.preferences.combatSpeechEnabled}
        combatAutoTagsEnabled={localStory.preferences.combatAutoTagsEnabled}
        combatProfanityEnabled={localStory.preferences.combatProfanityEnabled}
        onGenerateCombatPlan={localStory.generateCombatPlan}
        controlScheme={controlScheme}
        onManageImages={() => {
          setQuestVisible(false);
          setSlideshowReturn(null);
          setActivePanel('slideshow');
        }}
        onManageSources={() => {
          setQuestSourcesReturn(true);
          setQuestVisible(false);
          setSourcesReturn('settings');
          setActivePanel('sources');
        }}
        onDialogue={speakDialogue}
        videos={liveVideos}
        videoIndex={questVideoIndex}
        videoProgress={questVideoProgress}
        videoIsPlaying={playingQuadrants.has(`${session}-${questVideoIndex}`)}
        combatPlaybackActive={[...playingQuadrants].some((id) => id.startsWith(`${session}-`))}
        bossVideoEnded={bossVideoEnded}
        onSelectVideo={selectQuestVideo}
        onBeginBossVideo={beginBossVideo}
        onEndBossVideo={endBossVideo}
        onBpmResult={recordVideoBpm}
      />
    </SafeAreaView>
    </ColorContext.Provider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  webSafeArea: { paddingTop: 67, paddingBottom: 34 },
  screen: { flex: 1 },
  browserScreen: { paddingHorizontal: 12, paddingBottom: 8 },
  browserToolbar: { marginBottom: 8 },
  toolbarOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 120, elevation: 120 },
  topBar: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 4,
    flexWrap: 'wrap',
    rowGap: 8,
  },
  brandBlock: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brandMark: {
    width: 34,
    height: 34,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    padding: 3,
    alignContent: 'center',
    justifyContent: 'center',
  },
  brandSquare: { width: 12, height: 12, borderRadius: 3 },
  brandName: { fontSize: 15, fontWeight: '700', letterSpacing: 1.7 },
  brandMeta: { fontSize: 9, fontWeight: '600', letterSpacing: 1, marginTop: 2 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 1 },
  actionButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  actionButtonCompact: { width: 42, minHeight: 42, paddingHorizontal: 0 },
  actionLabel: { fontSize: 13, fontWeight: '600' },
  disabledButton: { opacity: 0.45 },
  pressedButton: { opacity: 0.72, transform: [{ scale: 0.97 }] },
  grid: {
    flex: 1,
    zIndex: 1,
  },
  gridRow: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
  },
  hiddenGridRow: { display: 'none' },
  tile: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
  },
  tileHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 2,
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  focusButton: { width: 30, height: 28, alignItems: 'center', justifyContent: 'center' },
  questFab: {
    position: 'absolute',
    zIndex: 16,
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  questFabText: { fontSize: 11, fontWeight: '800' },
  streamNumber: {
    width: 25,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  streamNumberText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  videoName: { flex: 1, fontSize: 12, fontWeight: '500' },
  bpmPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8 },
  bpmText: { fontSize: 10, fontWeight: '800', fontVariant: ['tabular-nums'] },
  liveDot: { width: 7, height: 7, borderRadius: 4, marginLeft: 4 },
  videoFrame: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  videoStatus: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
  },
  videoStatusText: { fontSize: 12, textAlign: 'center' },
  retryButton: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 3,
  },
  retryText: { fontSize: 12, fontWeight: '600' },
  tileControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    minHeight: 88,
    paddingTop: 4,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 1,
    paddingHorizontal: 8,
  },
  tileControlRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
  seekBarRow: { height: 32, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 3 },
  seekTime: { width: 42, fontSize: 9, fontVariant: ['tabular-nums'], textAlign: 'center' },
  seekSlider: { flex: 1, height: 34 },
  iconControl: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  volumeTrackHitbox: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  volumeTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  volumeFill: { height: 4, borderRadius: 2 },
  volumePercent: { width: 28, textAlign: 'right', fontSize: 10, fontVariant: ['tabular-nums'] },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 18,
  },
  emptyMark: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    marginBottom: 19,
  },
  emptyGrid: { flexDirection: 'row', flexWrap: 'wrap', width: 34, gap: 4 },
  emptySquare: { width: 15, height: 15, borderRadius: 4 },
  emptyTitle: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  emptyDescription: {
    maxWidth: 440,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 9,
  },
  emptyActions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  pickingStatus: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 14 },
  supportNote: {
    position: 'absolute',
    bottom: 10,
    fontSize: 10,
    letterSpacing: 0.25,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
  },
  modalPanel: {
    width: '76%',
    maxWidth: 760,
    maxHeight: '86%',
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: '700' },
  modalSubtitle: { fontSize: 12, lineHeight: 18, marginTop: 4, maxWidth: 560 },
  settingsHeading: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  settingsBackButton: { width: 34, height: 42, alignItems: 'center', justifyContent: 'center' },
  modalClose: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsScroll: { flexShrink: 1, minHeight: 0 },
  settingsContent: { paddingBottom: 12 },
  settingsCategoryList: { gap: 9 },
  settingsCategoryCard: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 11,
    borderWidth: 1,
    borderRadius: 12,
  },
  settingsCategoryIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsCategoryTitle: { fontSize: 14, fontWeight: '600' },
  settingsCategoryDescription: { fontSize: 11, lineHeight: 15, marginTop: 3 },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 10,
  },
  backupCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8, marginTop: 4, marginBottom: 10 },
  backupActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  syncSettingRow: { marginLeft: 16 },
  settingCopy: { flex: 1 },
  settingTitle: { fontSize: 14, fontWeight: '600' },
  settingDescription: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  themeSectionTitle: { fontSize: 12, fontWeight: '600', marginTop: 6, marginBottom: 6 },
  themeDescription: { fontSize: 10, lineHeight: 15, marginBottom: 10 },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 2 },
  themeOption: {
    width: '31%',
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 10,
  },
  themeSwatch: {
    width: 18,
    height: 18,
    borderRadius: 9,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  themeSwatchStripe: { flex: 1 },
  themeText: { flex: 1 },
  themeName: { fontSize: 13, fontWeight: '600' },
  themeUnlock: { fontSize: 9, marginTop: 1 },
  poolList: { flexGrow: 0, maxHeight: 460 },
  poolListContent: { paddingBottom: 4 },
  poolRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 5,
  },
  poolFileName: { flex: 1, fontSize: 14, fontWeight: '500' },
  removeFileButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPool: { paddingVertical: 28, fontSize: 14, textAlign: 'center' },
});
