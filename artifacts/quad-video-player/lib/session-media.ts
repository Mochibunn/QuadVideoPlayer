import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { publicMediaUrl } from './online-sources';

export type MediaAccess = { uri: string; readable: boolean; persistent: boolean };
export async function inspectSessionMedia(uris: string[], retain: boolean): Promise<MediaAccess[]> {
  const remote = uris.filter((uri) => publicMediaUrl(uri));
  const local = uris.filter((uri) => /^(content|file):\/\//.test(uri));
  if (remote.length + local.length !== uris.length) throw new Error('Unsupported media address in this session.');
  // HTTPS playback does not use Android URI grants. Availability is checked by
  // the player, not by opening remote streams while saving a checkpoint.
  const online = remote.map((uri) => ({ uri, readable: true, persistent: true }));
  if (!local.length) return online;
  const native = Platform.OS === 'android'
    ? requireOptionalNativeModule<{ inspectSessionMedia(uris: string[], retain: boolean): Promise<MediaAccess[]> }>('DownloadsMedia')
    : null;
  if (!native) throw new Error('Saving and resuming sessions requires the updated standalone Android APK.');
  return [...await native.inspectSessionMedia(local, retain), ...online];
}
