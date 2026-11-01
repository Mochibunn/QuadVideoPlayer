import { requireOptionalNativeModule } from 'expo';
import * as DocumentPicker from 'expo-document-picker';
import { Alert, Platform } from 'react-native';

export type PickedMedia = { uri: string; name: string; mimeType?: string | null };
type PickResult = { canceled: boolean; assets?: PickedMedia[] | null };
type MediaTools = {
  pickFiles(samsung: boolean): Promise<PickResult>;
  getVideoPreview(uri: string): Promise<string>;
};

function tools() {
  return Platform.OS === 'android'
    ? requireOptionalNativeModule<MediaTools>('DownloadsMedia')
    : null;
}

async function systemPicker(): Promise<PickResult> {
  return DocumentPicker.getDocumentAsync({
    type: '*/*',
    multiple: true,
    copyToCacheDirectory: false,
  });
}

/** The caller keeps its picker lock until the menu and external activity finish. */
export async function pickMediaFiles(): Promise<PickResult> {
  const native = tools();
  if (!native) return systemPicker();
  const choice = await new Promise<'samsung' | 'other' | 'system' | null>((resolve) => {
    Alert.alert(
      'Select files with',
      'Use Samsung My Files if installed, choose another compatible app, or use Android’s system picker. Long-press a file to select multiple files when supported.',
      [
        { text: 'Samsung My Files', onPress: () => resolve('samsung') },
        { text: 'Choose another app', onPress: () => resolve('other') },
        { text: 'System picker', onPress: () => resolve('system') },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
  if (!choice) return { canceled: true };
  if (choice === 'system') return systemPicker();
  try {
    return await native.pickFiles(choice === 'samsung');
  } catch (error) {
    const fallback = await new Promise<'other' | 'system' | null>((resolve) => {
      Alert.alert(
        'File manager unavailable',
        error instanceof Error ? error.message : 'This app could not select files.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
          { text: 'Choose another app', onPress: () => resolve('other') },
          { text: 'System picker', onPress: () => resolve('system') },
        ],
        { cancelable: true, onDismiss: () => resolve(null) },
      );
    });
    if (!fallback) return { canceled: true };
    return fallback === 'system' ? systemPicker() : native.pickFiles(false);
  }
}

// Serialize requests so opening a long pool does not compete with four video
// players for multiple thumbnail decoders. Unmounted rows skip queued work.
let previewQueue: Promise<unknown> = Promise.resolve();
export function getVideoPreview(uri: string, stillNeeded: () => boolean): Promise<string | null> {
  const result = previewQueue.then(async () => {
    if (!stillNeeded()) return null;
    const native = tools();
    if (!native) throw new Error('Preview requires the standalone Android APK.');
    return native.getVideoPreview(uri);
  });
  previewQueue = result.catch(() => undefined);
  return result;
}
