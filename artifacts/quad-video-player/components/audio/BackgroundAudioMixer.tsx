import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import AudioTrackEngine, { type AudioTrack, type AudioTrackStatus } from './AudioTrackEngine';
import TrackVolumeControl from './TrackVolumeControl';
import { hasVideoExtension, isBackgroundMediaFile } from '@/lib/media-formats';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCountChange: (count: number) => void;
};

export default function BackgroundAudioMixer({ visible, onClose, onCountChange }: Props) {
  const colors = useColors();
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [isPicking, setIsPicking] = useState(false);
  const allPaused = tracks.length > 0 && tracks.every((track) => track.paused);

  useEffect(() => {
    onCountChange(tracks.length);
  }, [onCountChange, tracks.length]);

  const reportStatus = useCallback((id: string, status: AudioTrackStatus, error: string) => {
    setTracks((current) => {
      const track = current.find((item) => item.id === id);
      if (!track || (track.status === status && track.error === error)) return current;
      return current.map((item) => item.id === id ? { ...item, status, error } : item);
    });
  }, []);

  const updateTrack = (id: string, update: Partial<AudioTrack>) => {
    setTracks((current) => current.map((track) => track.id === id ? { ...track, ...update } : track));
  };

  const addTracks = async () => {
    if (isPicking) return;
    setIsPicking(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        // Include video containers and files with generic provider MIME types.
        type: '*/*',
        multiple: true,
        copyToCacheDirectory: false,
      });
      if (result.canceled) return;
      const selected = result.assets.filter(isBackgroundMediaFile);
      if (selected.length === 0) {
        Alert.alert('No media selected', 'Choose audio files or videos containing an audio track.');
        return;
      }
      setTracks((current) => {
        const known = new Set(current.map((track) => track.uri));
        const additions: AudioTrack[] = [];
        for (const asset of selected) {
          if (known.has(asset.uri)) continue;
          known.add(asset.uri);
          additions.push({
            id: asset.uri,
            uri: asset.uri,
            name: asset.name,
            volume: 0.25,
            paused: false,
            muted: false,
            status: 'loading',
            error: '',
            retry: 0,
          });
        }
        return additions.length ? [...current, ...additions] : current;
      });
      const ignored = result.assets.length - selected.length;
      if (ignored > 0) {
        Alert.alert('Some files were not added', `${ignored} selected file(s) were not recognized as audio or video.`);
      }
    } catch (error) {
      Alert.alert(
        'Could not add audio',
        error instanceof Error ? error.message : 'Try selecting the files again.',
      );
    } finally {
      setIsPicking(false);
    }
  };

  return (
    <>
      {tracks.map((track) => (
        <AudioTrackEngine
          key={`${track.id}:${track.retry}`}
          track={track}
          onStatus={reportStatus}
        />
      ))}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.header}>
              <View style={styles.heading}>
                <Text style={[styles.title, { color: colors.foreground }]}>Background audio</Text>
                <Text style={[styles.description, { color: colors.mutedForeground }]}>
                  Add audio files or use just the sound from videos. Each loops independently.
                </Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close background audio" onPress={onClose} style={styles.iconButton}>
                <Feather name="x" size={21} color={colors.foreground} />
              </Pressable>
            </View>
            <View style={styles.toolbar}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add audio tracks"
                disabled={isPicking}
                onPress={() => void addTracks()}
                style={[styles.action, { backgroundColor: colors.primary, opacity: isPicking ? 0.6 : 1 }]}
              >
                {isPicking
                  ? <ActivityIndicator size="small" color={colors.primaryForeground} />
                  : <Feather name="plus" size={17} color={colors.primaryForeground} />}
                <Text style={[styles.actionText, { color: colors.primaryForeground }]}>Add audio tracks</Text>
              </Pressable>
              {tracks.length > 0 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={allPaused ? 'Play all background audio' : 'Pause all background audio'}
                  onPress={() => setTracks((current) => current.map((track) => ({ ...track, paused: !allPaused })))}
                  style={[styles.action, { backgroundColor: colors.secondary }]}
                >
                  <Feather name={allPaused ? 'play' : 'pause'} size={17} color={colors.foreground} />
                  <Text style={[styles.actionText, { color: colors.foreground }]}>{allPaused ? 'Play audio' : 'Pause audio'}</Text>
                </Pressable>
              )}
              <Text style={[styles.count, { color: colors.mutedForeground }]}>
                {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
              </Text>
            </View>
            <FlatList
              data={tracks}
              keyExtractor={(track) => track.id}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Feather name="music" size={30} color={colors.primary} />
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                    Choose MP3, M4A, WAV, FLAC, Ogg and other audio files—or MP4, WebM, MOV and other videos. Only the audio plays here.
                  </Text>
                </View>
              }
              renderItem={({ item: track }) => (
                <View style={[styles.trackCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                  <View style={styles.trackHeader}>
                    <Feather name={hasVideoExtension(track.name) ? 'film' : 'music'} size={17} color={colors.primary} />
                    <View style={styles.trackName}>
                      <Text numberOfLines={1} ellipsizeMode="middle" style={[styles.name, { color: colors.foreground }]}>{track.name}</Text>
                      <Text style={[styles.status, { color: colors.mutedForeground }]}>
                        {track.status === 'error' ? 'Unable to play' : track.status === 'loading' ? 'Loading audio…' : track.paused ? 'Paused · Audio only · Loop on' : 'Playing · Audio only · Loop on'}
                      </Text>
                    </View>
                    {track.status === 'loading' && <ActivityIndicator size="small" color={colors.primary} />}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${track.paused ? 'Play' : 'Pause'} ${track.name}`}
                      onPress={() => updateTrack(track.id, { paused: !track.paused })}
                      style={styles.iconButton}
                    >
                      <Feather name={track.paused ? 'play' : 'pause'} size={19} color={colors.foreground} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${track.muted ? 'Unmute' : 'Mute'} ${track.name}`}
                      accessibilityState={{ selected: track.muted }}
                      onPress={() => updateTrack(track.id, { muted: !track.muted })}
                      style={styles.iconButton}
                    >
                      <Feather name={track.muted ? 'volume-x' : 'volume-2'} size={19} color={track.muted ? colors.primary : colors.foreground} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${track.name} from background audio`}
                      onPress={() => setTracks((current) => current.filter((item) => item.id !== track.id))}
                      style={styles.iconButton}
                    >
                      <Feather name="trash-2" size={18} color={colors.destructive} />
                    </Pressable>
                  </View>
                  <TrackVolumeControl
                    name={track.name}
                    value={track.volume}
                    onChange={(volume) => updateTrack(track.id, { volume })}
                  />
                  {track.muted && <Text style={[styles.status, { color: colors.primary }]}>Muted — your volume level is preserved</Text>}
                  {track.status === 'error' && (
                    <View style={styles.errorRow}>
                      <Text style={[styles.error, { color: colors.destructive }]}>{track.error || 'This audio format could not be played.'}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Retry ${track.name}`}
                        onPress={() => updateTrack(track.id, { retry: track.retry + 1, status: 'loading', error: '' })}
                        style={styles.retry}
                      >
                        <Text style={[styles.actionText, { color: colors.primary }]}>Retry</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              )}
            />
            <Text style={[styles.note, { color: colors.mutedForeground }]}>
              Tracks keep playing when this panel closes. Their levels are independent of video volume and Sync. Removing a track does not delete its file.
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.8)' },
  panel: { width: '92%', maxWidth: 900, maxHeight: '90%', padding: 20, borderWidth: 1, borderRadius: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  heading: { flex: 1 },
  title: { fontSize: 21, fontWeight: '700' },
  description: { fontSize: 13, lineHeight: 19, marginTop: 5 },
  toolbar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  action: { minHeight: 44, paddingHorizontal: 14, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionText: { fontSize: 13, fontWeight: '600' },
  count: { fontSize: 12, marginLeft: 'auto' },
  list: { flexGrow: 0, flexShrink: 1, maxHeight: 450 },
  listContent: { gap: 10, paddingBottom: 2 },
  trackCard: { padding: 12, borderWidth: 1, borderRadius: 12 },
  trackHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trackName: { flex: 1, marginLeft: 6 },
  name: { fontSize: 14, fontWeight: '600' },
  status: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 30, gap: 12 },
  emptyText: { fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 420 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  error: { flex: 1, fontSize: 12, lineHeight: 18 },
  retry: { minWidth: 55, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 11, lineHeight: 17, marginTop: 12 },
});
