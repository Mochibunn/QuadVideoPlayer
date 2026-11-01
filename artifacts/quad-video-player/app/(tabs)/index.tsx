import { Feather, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
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
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ColorContext, useColors } from '@/hooks/useColors';
import { useAutoHideControls } from '@/hooks/useAutoHideControls';
import BackgroundAudioMixer from '@/components/audio/BackgroundAudioMixer';
import SettingSwitch from '@/components/SettingSwitch';
import FadingControls from '@/components/FadingControls';
import ControlsTimeoutSetting from '@/components/ControlsTimeoutSetting';
import PoolVideoPreview from '@/components/PoolVideoPreview';
import SoundEffectsSettings from '@/components/SoundEffectsSettings';
import { usePlayerSoundEffects, useSoundSettings } from '@/hooks/useSoundSettings';
import { useSessionRegistry } from '@/hooks/useSessionRegistry';
import SessionControls from '@/components/SessionControls';
import ViewingSessionTimer from '@/components/ViewingSessionTimer';
import { useViewingSessions } from '@/hooks/useViewingSessions';
import { seekPosition, type SessionSnapshot, type VideoSnapshot } from '@/lib/sessions';
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
import { hasVideoExtension, isVideoFile, mediaPlaybackError, videoSourceForUri } from '@/lib/media-formats';
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

type ActivePanel = 'settings' | 'pool' | 'audio' | 'slideshow' | 'sources' | null;

const THEME_STORAGE_KEY = 'quad-video-player.theme';
const NORMALIZE_STORAGE_KEY = 'quad-video-player.normalize';
const SYNC_STORAGE_KEY = 'quad-video-player.sync';
const VIDEO_FILL_STORAGE_KEY = 'quad-video-player.video-fill';
const CONTROLS_DELAY_STORAGE_KEY = 'quad-video-player.controls-hide-seconds';

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
  globalPlaying,
  normalizeLoudness,
  linkedVolume,
  sharedVolume,
  onSharedVolumeChange,
  fillVideos,
  controlsVisible,
  onToggleControls,
  initialSnapshot,
  playbackId,
  onPlaybackStateChange,
  getNextVideo,
  onAssetChange,
}: {
  asset: VideoAsset;
  pool: VideoAsset[];
  index: number;
  globalPlaying: boolean;
  normalizeLoudness: boolean;
  linkedVolume: boolean;
  sharedVolume: number;
  onSharedVolumeChange: (volume: number) => void;
  fillVideos: boolean;
  controlsVisible: boolean;
  onToggleControls: () => void;
  initialSnapshot?: VideoSnapshot;
  playbackId: string;
  onPlaybackStateChange: (playbackId: string, playing: boolean, videoUri?: string) => void;
  getNextVideo: (slot: number, currentId: string) => VideoAsset | undefined;
  onAssetChange: (slot: number, next: VideoAsset) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [currentAsset, setCurrentAsset] = useState(asset);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(initialSnapshot?.muted ?? false);
  const [individualVolume, setIndividualVolume] = useState(initialSnapshot?.volume ?? START_VOLUME);
  const volume = linkedVolume ? sharedVolume : individualVolume;
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [volumeTrackWidth, setVolumeTrackWidth] = useState(0);
  const currentAssetRef = useRef(asset);
  currentAssetRef.current = currentAsset;
  const registry = useSessionRegistry();
  const pendingPosition = useRef<number | null>(initialSnapshot?.position ?? null);
  const restorePlaying = useRef(initialSnapshot?.playing ?? true);
  const firstGlobalEffect = useRef(true);
  const changingSource = useRef(false);
  const sourcePrepared = useRef(false);
  const nextSourcePlaying = useRef(false);
  const snapshotState = useRef({ individualVolume, isMuted, globalPlaying });
  snapshotState.current = { individualVolume, isMuted, globalPlaying };

  const player = useVideoPlayer(null, (videoPlayer) => {
    videoPlayer.bufferOptions = QUAD_BUFFER_OPTIONS;
    videoPlayer.loop = false;
    videoPlayer.volume = linkedVolume ? sharedVolume : (initialSnapshot?.volume ?? START_VOLUME);
    videoPlayer.muted = initialSnapshot?.muted ?? false;
    videoPlayer.audioMixingMode = 'mixWithOthers';
    videoPlayer.keepScreenOnWhilePlaying = true;
  });
  usePlayerSoundEffects(player);
  useEffect(() => prepareVideoSlot(
    player, asset.uri, index,
    () => {
      sourcePrepared.current = true;
      return pendingPosition.current === null && restorePlaying.current;
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
    if (restorePlaying.current) player.play();
    else player.pause();
  }, [globalPlaying, player]);
  useEventListener(player, 'sourceLoad', restorePosition);
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
      const shouldResume =
        globalPlaying && (forcePlayback || player.playing);
      changingSource.current = true;
      nextSourcePlaying.current = shouldResume;
      restorePlaying.current = shouldResume;
      currentAssetRef.current = next;
      onAssetChange(index, next);
      setCurrentAsset(next);
      setErrorMessage('');
      setIsLoading(true);
      try {
        await player.replaceAsync(videoSourceForUri(next.uri));
        if (shouldResume) player.play();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : 'This video could not be opened.',
        );
        setIsLoading(false);
      }
    },
    [getNextVideo, globalPlaying, index, onAssetChange, player],
  );

  useEventListener(player, 'playToEnd', () => {
    void advance(true);
  });

  useEventListener(player, 'playingChange', ({ isPlaying: playing }) => {
    setIsPlaying(playing);
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
    if (firstGlobalEffect.current) {
      firstGlobalEffect.current = false;
      if (initialSnapshot) {
        if (pendingPosition.current === null && restorePlaying.current) player.play();
        else player.pause();
        return;
      }
    }
    restorePlaying.current = globalPlaying;
    if (pendingPosition.current !== null || !sourcePrepared.current) return;
    if (globalPlaying) {
      player.play();
    } else {
      player.pause();
    }
  }, [globalPlaying, player]);

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

  const setVolumeFromTouch = useCallback(
    (locationX: number, width: number) => {
      if (width <= 0) return;
      const nextVolume = Math.min(1, Math.max(0, locationX / width));
      commitVolume(nextVolume);
    },
    [commitVolume],
  );

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
    nextSourcePlaying.current = globalPlaying;
    restorePlaying.current = globalPlaying;
    setErrorMessage('');
    setIsLoading(true);
    try {
      await player.replaceAsync(videoSourceForUri(currentAsset.uri));
      if (globalPlaying) player.play();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'This video could not be opened.',
      );
      setIsLoading(false);
    }
  };

  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: colors.card, borderColor: colors.border },
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

      <FadingControls visible={controlsVisible} interactive={false} style={[
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
        <View style={[styles.liveDot, { backgroundColor: errorMessage ? colors.destructive : colors.primary }]} />
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
          onLayout={(event) => setVolumeTrackWidth(event.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(event) =>
            setVolumeFromTouch(
              event.nativeEvent.locationX,
              volumeTrackWidth,
            )
          }
          onResponderMove={(event) =>
            setVolumeFromTouch(
              event.nativeEvent.locationX,
              volumeTrackWidth,
            )
          }
          style={styles.volumeTrackHitbox}
        >
          <View style={[styles.volumeTrack, { backgroundColor: colors.muted }]}>
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
      </FadingControls>
    </View>
  );
}

export default function QuadVideoPlayerScreen() {
  const { slideshow, captureSlideshow, restoreSlideshow } = useSlideshow();
  const online = useOnlineSources();
  const [sourcesReturn, setSourcesReturn] = useState<'settings' | 'slideshow'>('settings');
  const { inPip, enterPip, pipClosed, sound, setSound, loaded: soundLoaded } = useSoundSettings();
  const registry = useSessionRegistry();
  const [sessionBusy, setSessionBusy] = useState(false);
  const [restoredStreams, setRestoredStreams] = useState<VideoSnapshot[] | null>(null);
  const [themeId, setThemeId] = useState<ThemeId>('amethyst');
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
  const [pool, setPool] = useState<VideoAsset[]>([]);
  const [activeVideos, setActiveVideos] = useState<VideoAsset[]>([]);
  const [watchHistory, setWatchHistory] = useState<VideoWatchHistory>({});
  const [watchHistoryLoaded, setWatchHistoryLoaded] = useState(false);
  const watchHistoryRef = useRef<VideoWatchHistory>({});
  const watchHistoryWritable = useRef(false);
  const watchHistoryWriteQueue = useRef(Promise.resolve());
  const activeAssetsRef = useRef(new Map<number, VideoAsset>());
  const [session, setSession] = useState(0);
  const [globalPlaying, setGlobalPlaying] = useState(true);
  const [playingQuadrants, setPlayingQuadrants] = useState<Set<string>>(() => new Set());
  const [isPicking, setIsPicking] = useState(false);
  const [sourceLabel, setSourceLabel] = useState('');
  const insets = useSafeAreaInsets();
  const hasVideos = activeVideos.length > 0;
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');
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
    if (!watchHistoryLoaded) {
      Alert.alert('Video history is loading', 'Wait a moment, then choose the videos again.');
      return;
    }
    const library = applyVideoWatchHistory(videos, watchHistoryRef.current);
    const selection = pickInitialVideos(library);
    activeAssetsRef.current = new Map(selection.map((asset, index) => [index, asset]));
    setPool(library);
    setRestoredStreams(null);
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
      Alert.alert('Could not open Settings', 'Open Android Settings → Apps → Quad Video Player → Permissions.');
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
      setGlobalPlaying(false);
      void viewing.finishSession();
      return;
    }
  };

  const toggleAll = () => setGlobalPlaying((playing) => !playing);

  const stopPlayback = () => {
    activeAssetsRef.current.clear();
    setActiveVideos([]);
    setGlobalPlaying(false);
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
    setGlobalPlaying(saved.globalPlaying);
    registry.restoreAudio(saved.audio);
    setSession((current) => current + 1);
    setActivePanel(null);
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
            <View style={styles.brandMark}>
              <View style={[styles.brandSquare, { backgroundColor: colors.primary }]} />
              <View style={[styles.brandSquare, { backgroundColor: colors.accent }]} />
              <View style={[styles.brandSquare, { backgroundColor: colors.accent }]} />
              <View style={[styles.brandSquare, { backgroundColor: colors.primary }]} />
            </View>
            <View>
              <Text style={[styles.brandName, { color: colors.foreground }]}>
                QUAD
              </Text>
              <Text style={[styles.brandMeta, { color: colors.mutedForeground }]}>
                {pool.length > 0
                  ? `${pool.length} ${pool.length === 1 ? 'video' : 'videos'} · ${sourceLabel}`
                  : 'FOUR INDEPENDENT STREAMS'}
                {backgroundTrackCount > 0 ? ` · ${backgroundTrackCount} audio` : ''}
              </Text>
            </View>
          </View>

          <View pointerEvents="box-none" style={styles.topActions}>
            <SessionControls
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
                  label={globalPlaying ? 'Pause all videos' : 'Play all videos'}
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
              onPress={() => setActivePanel('settings')}
            />
          </View>
        </View>
        </FadingControls>

        {activeVideos.length > 0 ? (
          <View style={styles.grid}>
            {[0, 1].map((row) => (
              <View key={row} style={styles.gridRow}>
            {activeVideos.slice(row * 2, row * 2 + 2).map((asset, column) => {
              const index = row * 2 + column;
              const playbackId = `${session}-${index}`;
              return (
                <VideoTile
                  key={playbackId}
                  asset={asset}
                  pool={pool}
                  index={index}
                  playbackId={playbackId}
                  onPlaybackStateChange={reportQuadrantPlayback}
                  getNextVideo={getNextVideoForQuadrant}
                  onAssetChange={onAssetChange}
                  globalPlaying={globalPlaying}
                  normalizeLoudness={audioMode === 'normalized'}
                  linkedVolume={audioMode === 'shared'}
                  sharedVolume={sharedVolume}
                  onSharedVolumeChange={setSharedVolume}
                  fillVideos={fillVideos}
                  controlsVisible={!inPip && controls.visible}
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
              <View style={styles.emptyGrid}>
                {[0, 1, 2, 3].map((item) => (
                  <View
                    key={item}
                    style={[
                      styles.emptySquare,
                      { backgroundColor: item === 0 || item === 3 ? colors.primary : colors.muted },
                    ]}
                  />
                ))}
              </View>
            </LinearGradient>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              Four views. One screen.
            </Text>
            <Text style={[styles.emptyDescription, { color: colors.mutedForeground }]}>
              Pick a video folder or select multiple files. Four clips start at
              random, then each stream independently chooses its next video.
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
              Landscape tablet playback · independent play, skip and volume controls
            </Text>
          </View>
        )}
        <SlideshowOverlay active={hasVideos && !pipClosed} />
        <ViewingSessionTimer
          store={viewing.store}
          visible={hasVideos || !!viewing.store.active || viewing.store.leaderboard.length > 0 || viewing.store.totalPlaybackMs > 0 || !!viewing.error}
          ready={viewing.ready}
          error={viewing.error}
          isPlaying={isPlaybackActive}
          celebration={viewing.celebration}
          finishRecap={viewing.finishRecap}
          onCelebrateDone={() => viewing.setCelebration(null)}
          onRecapDismiss={() => viewing.setFinishRecap(null)}
          onEndSession={viewing.finishSession}
          onRetry={() => void viewing.retryStorage()}
        />
      </View>
      <Modal
        visible={activePanel === 'settings'}
        transparent
        animationType="fade"
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
              <View style={styles.settingCopy}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  Settings
                </Text>
                <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
                  Audio controls and OLED-black accent themes.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close settings"
                onPress={() => setActivePanel(null)}
                style={styles.modalClose}
              >
                <Feather name="x" size={20} color={colors.foreground} />
              </Pressable>
            </View>
            <ScrollView
              style={styles.settingsScroll}
              contentContainerStyle={styles.settingsContent}
              showsVerticalScrollIndicator
            >
            <View
              style={[
                styles.settingRow,
                { borderColor: colors.border, backgroundColor: colors.secondary },
              ]}
            >
              <View style={styles.settingCopy}>
                <Text style={[styles.settingTitle, { color: colors.foreground }]}>
                  Normalize volume
                </Text>
                <Text style={[styles.settingDescription, { color: colors.mutedForeground }]}>
                  {normalizeEnabled
                    ? (syncEnabled ? 'ON · Shared volume sliders are active.' : 'ON · Live loudness processing is active.')
                    : 'OFF · Original audio with independent volume sliders.'}
                </Text>
              </View>
              <SettingSwitch
                label="Normalize volume"
                value={normalizeEnabled}
                onValueChange={setNormalizeEnabled}
                disabled={Platform.OS !== 'android'}
              />
            </View>
            {normalizeEnabled && (
              <View
                style={[
                  styles.settingRow,
                  styles.syncSettingRow,
                  { borderColor: colors.border, backgroundColor: colors.secondary },
                ]}
              >
                <View style={styles.settingCopy}>
                  <Text style={[styles.settingTitle, { color: colors.foreground }]}>
                    Sync
                  </Text>
                  <Text style={[styles.settingDescription, { color: colors.mutedForeground }]}>
                    {syncEnabled
                      ? 'ON · One shared slider level for all videos.'
                      : 'OFF · True per-video loudness normalization.'}
                  </Text>
                </View>
                <SettingSwitch
                  label="Sync video volume sliders"
                  value={syncEnabled}
                  onValueChange={setSyncEnabled}
                />
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
            <ControlsTimeoutSetting
              value={controlsHideSeconds}
              onChange={setControlsHideSeconds}
              disabled={!playbackSettingsLoaded}
            />
            <SoundEffectsSettings />
            <ActionButton icon="globe" label="Online media sources" onPress={() => {
              setSourcesReturn('settings'); setActivePanel('sources');
            }} />
            <ActionButton icon="image" label={`Image / GIF slideshow (${slideshow.pool.length})`}
              onPress={() => setActivePanel('slideshow')} />
            <ActionButton icon="alert-circle" label="Last crash report" onPress={() => void showCrashReport()} />
            <Text style={[styles.themeSectionTitle, { color: colors.mutedForeground }]}>
              Accent themes
            </Text>
            <View style={styles.themeGrid}>
              {themePresets.map((theme) => {
                const isSelected = theme.id === themeId;
                return (
                  <Pressable
                    key={theme.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${theme.name} theme`}
                    onPress={() => setThemeId(theme.id)}
                    style={[
                      styles.themeOption,
                      {
                        backgroundColor: colors.secondary,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <View style={[styles.themeSwatch, { backgroundColor: theme.primary }]} />
                    <Text
                      numberOfLines={1}
                      style={[styles.themeName, { color: colors.foreground }]}
                    >
                      {theme.name}
                    </Text>
                    {isSelected && (
                      <Feather name="check" size={15} color={colors.primary} />
                    )}
                  </Pressable>
                );
              })}
            </View>
            </ScrollView>
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
      <SlideshowPanel visible={activePanel === 'slideshow'} onClose={() => setActivePanel('settings')}
        onManageSources={() => { setSourcesReturn('slideshow'); setActivePanel('sources'); }} />
      <OnlineSourcesPanel visible={activePanel === 'sources'} onClose={() => setActivePanel(sourcesReturn)}
        onPlayVideos={(items: RemoteMedia[], name: string) => {
          const apply = () => {
            startStreams(items.map((item) => ({ id: item.uri, uri: item.uri, name: item.name })));
            setSourceLabel(name); setActivePanel(null);
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
  toolbarOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
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
  },
  gridRow: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
  },
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
  streamNumber: {
    width: 25,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  streamNumberText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  videoName: { flex: 1, fontSize: 12, fontWeight: '500' },
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
    minHeight: 52,
    paddingTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
  },
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
  modalClose: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsScroll: { flexShrink: 1, minHeight: 0 },
  settingsContent: { paddingBottom: 12 },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 10,
  },
  syncSettingRow: { marginLeft: 16 },
  settingCopy: { flex: 1 },
  settingTitle: { fontSize: 14, fontWeight: '600' },
  settingDescription: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  themeSectionTitle: { fontSize: 12, fontWeight: '600', marginTop: 6, marginBottom: 10 },
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
  themeSwatch: { width: 18, height: 18, borderRadius: 9 },
  themeName: { flex: 1, fontSize: 13, fontWeight: '600' },
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
