import { requireOptionalNativeModule } from 'expo';
import { PermissionsAndroid, Platform } from 'react-native';
import { downloadsAccess, permissionsForDownloads } from './downloads-permissions';

type DownloadsVideo = { name: string; uri: string; mimeType: string | null };
type DownloadsModule = { getVideos(): Promise<DownloadsVideo[]> };

export async function readDownloadsVideos() {
  if (Platform.OS !== 'android') throw new Error('Downloads library access is available on Android.');
  const module = requireOptionalNativeModule<DownloadsModule>('DownloadsMedia');
  if (!module) {
    throw new Error('The Downloads shortcut requires the updated standalone Android APK. In Expo Go, select individual video files instead.');
  }
  const api = Number(Platform.Version);
  const permissions = permissionsForDownloads(api) as Array<Parameters<typeof PermissionsAndroid.request>[0]>;
  const checks = await Promise.all(permissions.map(async (permission) => [
    permission, await PermissionsAndroid.check(permission),
  ] as const));
  let access = downloadsAccess(api, Object.fromEntries(checks));
  if (access === 'denied') {
    const results = await PermissionsAndroid.requestMultiple(permissions);
    access = downloadsAccess(api, Object.fromEntries(permissions.map((permission) => [
      permission, results[permission] === PermissionsAndroid.RESULTS.GRANTED,
    ])));
  }
  if (access === 'denied') return { access, videos: [] };
  return { access, videos: await module.getVideos() };
}
