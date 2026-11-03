import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export async function inspectVideoPlayback(uri: string): Promise<string> {
  const native = Platform.OS === 'android'
    ? requireOptionalNativeModule<{ inspectVideoPlayback?(uri: string): Promise<string> }>('DownloadsMedia')
    : null;
  if (!native?.inspectVideoPlayback) return 'Install the updated standalone Android APK to inspect video tracks.';
  return native.inspectVideoPlayback(uri);
}
