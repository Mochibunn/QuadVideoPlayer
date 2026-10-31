import { useEventListener } from 'expo';
import { useVideoPlayer } from 'expo-video';
import { memo, useEffect } from 'react';

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
  const player = useVideoPlayer({ uri: track.uri }, (instance) => {
    instance.loop = true;
    instance.audioMixingMode = 'mixWithOthers';
    instance.volume = track.volume;
    instance.muted = track.muted;
    instance.staysActiveInBackground = false;
  });

  useEventListener(player, 'statusChange', ({ status, error }) => {
    onStatus(
      track.id,
      status === 'error' ? 'error' : status === 'readyToPlay' ? 'ready' : 'loading',
      error?.message ?? '',
    );
  });

  useEffect(() => {
    const status = player.status;
    onStatus(
      track.id,
      status === 'error' ? 'error' : status === 'readyToPlay' ? 'ready' : 'loading',
      status === 'error' ? 'Could not open this audio file. Try selecting it again.' : '',
    );
  }, [onStatus, player, track.id]);

  useEffect(() => {
    player.volume = track.volume;
  }, [player, track.volume]);

  useEffect(() => {
    player.muted = track.muted;
  }, [player, track.muted]);

  useEffect(() => {
    if (track.paused) player.pause();
    else player.play();
  }, [player, track.paused]);

  // useVideoPlayer releases the native player on unmount/removal.
  return null;
}

export default memo(AudioTrackEngine);
