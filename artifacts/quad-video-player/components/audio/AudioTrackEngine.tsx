import { useEventListener } from 'expo';
import { useVideoPlayer } from 'expo-video';
import { memo, useEffect, useRef } from 'react';
import { mediaPlaybackError } from '@/lib/media-formats';

export type AudioTrackStatus = 'loading' | 'ready' | 'error';

export type AudioTrack = {
  id: string;
  uri: string;
  name: string;
  volume: number;
  paused: boolean;
  muted: boolean;
  status: AudioTrackStatus;
  error: string;
  retry: number;
};

type Props = {
  track: AudioTrack;
  onStatus: (id: string, status: AudioTrackStatus, error: string) => void;
};

// This component must stay mounted outside the modal and virtualized list.
// Closing the panel or scrolling a row offscreen must not release its player.
function AudioTrackEngine({ track, onStatus }: Props) {
  const blockingError = useRef('');
  // Configure the native audio-only selector BEFORE loading any media, so even
  // preparing a video source cannot allocate a fifth video decoder.
  const player = useVideoPlayer(null, (instance) => {
    const native = instance as typeof instance & { audioOnly?: boolean };
    if (typeof native.audioOnly === 'boolean') native.audioOnly = true;
    instance.loop = true;
    instance.audioMixingMode = 'mixWithOthers';
    instance.volume = track.volume;
    instance.muted = track.muted;
    instance.staysActiveInBackground = false;
  });

  const audioOnlySupported = typeof (player as typeof player & { audioOnly?: boolean }).audioOnly === 'boolean';

  useEventListener(player, 'sourceLoad', ({ videoSource, availableAudioTracks }) => {
    if (!videoSource) return;
    if (availableAudioTracks.length === 0) {
      blockingError.current = 'This file contains no audio track usable by Android. Choose another file.';
      player.pause();
      onStatus(track.id, 'error', blockingError.current);
    }
  });

  useEventListener(player, 'statusChange', ({ status, error }) => {
    if (status === 'readyToPlay' && player.availableAudioTracks.length === 0) {
      blockingError.current = 'This file contains no audio track usable by Android. Choose another file.';
      player.pause();
    }
    if (blockingError.current) {
      onStatus(track.id, 'error', blockingError.current);
      return;
    }
    if (status === 'readyToPlay' && audioOnlySupported) {
      if (track.paused) player.pause();
      else player.play();
    }
    onStatus(
      track.id,
      status === 'error' ? 'error' : status === 'readyToPlay' ? 'ready' : 'loading',
      status === 'error' ? mediaPlaybackError(error?.message) : '',
    );
  });

  useEffect(() => {
    if (!audioOnlySupported) {
      blockingError.current = 'Audio-only playback requires the updated standalone Android APK, not Expo Go.';
      player.pause();
      onStatus(track.id, 'error', blockingError.current);
      return;
    }
    let mounted = true;
    onStatus(track.id, 'loading', '');
    // replaceAsync and audioOnly's setter both use Android's main queue; this
    // is enqueued after track selection has been configured in the initializer.
    void player.replaceAsync({ uri: track.uri }).catch((error: unknown) => {
      if (!mounted) return;
      blockingError.current = mediaPlaybackError(error instanceof Error ? error.message : undefined);
      onStatus(track.id, 'error', blockingError.current);
    });
    return () => { mounted = false; };
  }, [audioOnlySupported, onStatus, player, track.id, track.uri]);

  useEffect(() => {
    player.volume = track.volume;
  }, [player, track.volume]);

  useEffect(() => {
    player.muted = track.muted;
  }, [player, track.muted]);

  useEffect(() => {
    if (!audioOnlySupported || blockingError.current || track.paused) player.pause();
    else player.play();
  }, [audioOnlySupported, player, track.paused]);

  // useVideoPlayer releases the native player on unmount/removal.
  return null;
}

export default memo(AudioTrackEngine);
