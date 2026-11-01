import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export type MediaAccess = { uri: string; readable: boolean; persistent: boolean };
export async function inspectSessionMedia(uris: string[], retain: boolean): Promise<MediaAccess[]> {
  const native = Platform.OS === 'android'
    ? requireOptionalNativeModule<{ inspectSessionMedia(uris: string[], retain: boolean): Promise<MediaAccess[]> }>('DownloadsMedia')
    : null;
  if (!native) throw new Error('Saving and resuming sessions requires the updated standalone Android APK.');
  return native.inspectSessionMedia(uris, retain);
}
