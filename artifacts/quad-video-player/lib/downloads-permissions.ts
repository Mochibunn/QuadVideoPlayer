export const DOWNLOADS_PERMISSIONS = {
  legacy: 'android.permission.READ_EXTERNAL_STORAGE',
  video: 'android.permission.READ_MEDIA_VIDEO',
  selected: 'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
} as const;

export function permissionsForDownloads(apiLevel: number): string[] {
  if (apiLevel >= 34) return [DOWNLOADS_PERMISSIONS.video, DOWNLOADS_PERMISSIONS.selected];
  return [apiLevel >= 33 ? DOWNLOADS_PERMISSIONS.video : DOWNLOADS_PERMISSIONS.legacy];
}

export function downloadsAccess(
  apiLevel: number,
  grants: Record<string, boolean>,
): 'full' | 'limited' | 'denied' {
  if (grants[apiLevel >= 33 ? DOWNLOADS_PERMISSIONS.video : DOWNLOADS_PERMISSIONS.legacy]) return 'full';
  if (apiLevel >= 34 && grants[DOWNLOADS_PERMISSIONS.selected]) return 'limited';
  return 'denied';
}
