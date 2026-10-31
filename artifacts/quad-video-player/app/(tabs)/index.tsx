import { Feather, Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Directory } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useEventListener } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

type VideoAsset = {
  id: string;
  name: string;
  uri: string;
};

const VIDEO_EXTENSIONS = new Set([
  '3gp',
  'avi',
  'm4v',
  'mkv',
  'mov',
  'mp4',
  'mpeg',
  'mpg',
  'ts',
  'webm',
]);

const STREAM_COUNT = 4;
const START_VOLUME = 0.25;

function isSupportedVideo(name: string) {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return VIDEO_EXTENSIONS.has(extension);
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

function shuffled<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function pickInitialVideos(pool: VideoAsset[]) {
  const selection = shuffled(pool).slice(0, STREAM_COUNT);
  while (selection.length < STREAM_COUNT) {
    selection.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  return selection;
}

function pickNextVideo(pool: VideoAsset[], currentId: string) {
  if (pool.length < 2) return pool[0];
  const options = pool.filter((asset) => asset.id !== currentId);
  return options[Math.floor(Math.random() * options.length)];
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
}: {
  asset: VideoAsset;
  pool: VideoAsset[];
  index: number;
  globalPlaying: boolean;
}) {
  const colors = useColors();
  const [currentAsset, setCurrentAsset] = useState(asset);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(START_VOLUME);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [volumeTrackWidth, setVolumeTrackWidth] = useState(0);
  const currentAssetRef = useRef(asset);
  currentAssetRef.current = currentAsset;

  const player = useVideoPlayer({ uri: asset.uri }, (videoPlayer) => {
    videoPlayer.loop = false;
    videoPlayer.volume = START_VOLUME;
    videoPlayer.muted = false;
    videoPlayer.audioMixingMode = 'mixWithOthers';
    videoPlayer.keepScreenOnWhilePlaying = true;
    videoPlayer.play();
  });

  const advance = useCallback(
    async (forcePlayback = false) => {
      const next = pickNextVideo(pool, currentAssetRef.current.id);
      if (!next) return;
      const shouldResume =
        globalPlaying && (forcePlayback || player.playing);
      currentAssetRef.current = next;
      setCurrentAsset(next);
      setErrorMessage('');
      setIsLoading(true);
      try {
        await player.replaceAsync({ uri: next.uri });
        if (shouldResume) player.play();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : 'This video could not be opened.',
        );
        setIsLoading(false);
      }
    },
    [globalPlaying, player, pool],
  );

  useEventListener(player, 'playToEnd', () => {
    void advance(true);
  });

  useEventListener(player, 'playingChange', ({ isPlaying: playing }) => {
    setIsPlaying(playing);
  });

  useEventListener(player, 'statusChange', ({ status, error }) => {
    setIsLoading(status === 'loading' || status === 'idle');
    if (status === 'error') {
      setErrorMessage(error?.message ?? 'This video could not be played.');
    } else if (status === 'readyToPlay') {
      setErrorMessage('');
    }
  });

  useEffect(() => {
    player.volume = volume;
  }, [player, volume]);

  useEffect(() => {
    player.muted = isMuted;
  }, [isMuted, player]);

  useEffect(() => {
    if (globalPlaying) {
      player.play();
    } else {
      player.pause();
    }
  }, [globalPlaying, player]);

  const setVolumeFromTouch = useCallback(
    (locationX: number, width: number) => {
      if (width <= 0) return;
      const nextVolume = Math.min(1, Math.max(0, locationX / width));
      setVolume(nextVolume);
      if (nextVolume > 0) setIsMuted(false);
    },
    [],
  );

  const toggleTilePlayback = () => {
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
  };

  const retry = async () => {
    setErrorMessage('');
    setIsLoading(true);
    try {
      await player.replaceAsync({ uri: currentAsset.uri });
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
      <View style={[styles.tileHeader, { borderBottomColor: colors.border }]}>
        <View style={[styles.streamNumber, { backgroundColor: colors.accent }]}>
          <Text style={[styles.streamNumberText, { color: colors.accentForeground }]}>
            0{index + 1}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          ellipsizeMode="middle"
          style={[styles.videoName, { color: colors.foreground }]}
        >
          {currentAsset.name}
        </Text>
        <View
          style={[
            styles.liveDot,
            { backgroundColor: errorMessage ? colors.destructive : colors.primary },
          ]}
        />
      </View>

      <View style={[styles.videoFrame, { backgroundColor: colors.background }]}>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          nativeControls={false}
          surfaceType="surfaceView"
        />
        {isLoading && !errorMessage && (
          <View style={styles.videoStatus}>
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
          </View>
        )}
      </View>

      <View style={[styles.tileControls, { borderTopColor: colors.border }]}>
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
          accessibilityLabel={`Volume for stream ${index + 1}`}
          accessibilityValue={{
            min: 0,
            max: 100,
            now: Math.round(volume * 100),
          }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={({ nativeEvent }) => {
            if (nativeEvent.actionName === 'increment') {
              setVolume((current) => Math.min(1, current + 0.05));
              setIsMuted(false);
            } else if (nativeEvent.actionName === 'decrement') {
              setVolume((current) => Math.max(0, current - 0.05));
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
      </View>
    </View>
  );
}

export default function QuadVideoPlayerScreen() {
  const colors = useColors();
  const [pool, setPool] = useState<VideoAsset[]>([]);
  const [activeVideos, setActiveVideos] = useState<VideoAsset[]>([]);
  const [session, setSession] = useState(0);
  const [globalPlaying, setGlobalPlaying] = useState(true);
  const [isPicking, setIsPicking] = useState(false);
  const [sourceLabel, setSourceLabel] = useState('');

  const startStreams = useCallback((videos: VideoAsset[]) => {
    if (videos.length === 0) {
      Alert.alert('No videos found', 'Choose a folder or select video files.');
      return;
    }
    setPool(videos);
    setActiveVideos(pickInitialVideos(videos));
    setSession((current) => current + 1);
    setGlobalPlaying(true);
  }, []);

  const chooseVideoFiles = async () => {
    setIsPicking(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'video/*',
        multiple: true,
        copyToCacheDirectory: false,
      });
      if (!result.canceled) {
        const videos = result.assets
          .filter(
            (item) =>
              item.mimeType?.startsWith('video/') || isSupportedVideo(item.name),
          )
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

  const chooseVideoFolder = async () => {
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

  const toggleAll = () => setGlobalPlaying((playing) => !playing);

  const stopPlayback = () => {
    setActiveVideos([]);
    setGlobalPlaying(false);
  };

  return (
    <SafeAreaView
      edges={['top', 'bottom', 'left', 'right']}
      style={[
        styles.safeArea,
        { backgroundColor: colors.background },
        Platform.OS === 'web' && styles.webSafeArea,
      ]}
    >
      <StatusBar hidden />
      <View style={styles.screen}>
        <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
          <View style={styles.brandBlock}>
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
              </Text>
            </View>
          </View>

          <View style={styles.topActions}>
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
                  icon={globalPlaying ? 'pause' : 'play'}
                  label={globalPlaying ? 'Pause all streams' : 'Play all streams'}
                  onPress={toggleAll}
                />
                <ActionButton
                  compact
                  icon="square"
                  label="Stop playback"
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
          </View>
        </View>

        {activeVideos.length > 0 ? (
          <View style={styles.grid}>
            {activeVideos.map((asset, index) => (
              <VideoTile
                key={`${session}-${index}`}
                asset={asset}
                pool={pool}
                index={index}
                globalPlaying={globalPlaying}
              />
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  webSafeArea: { paddingTop: 67, paddingBottom: 34 },
  screen: { flex: 1, paddingHorizontal: 12, paddingBottom: 8 },
  topBar: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
    paddingHorizontal: 4,
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
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tile: {
    width: '49.3%',
    flexGrow: 1,
    height: '49.3%',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
  },
  tileHeader: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  videoFrame: { flex: 1, overflow: 'hidden' },
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
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  iconControl: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  volumeTrackHitbox: {
    flex: 1,
    height: 30,
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
});
