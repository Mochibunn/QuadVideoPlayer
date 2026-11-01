// Containers recognized by Media3's native extractors. The codec inside a
// container must also be supported by Android; an extension is not a decoder.
export const VIDEO_EXTENSIONS = [
  'mp4', 'm4v', 'mov', 'webm', 'mkv', '3gp', '3gpp', '3g2',
  'avi', 'ts', 'mts', 'm2ts', 'mpeg', 'mpg', 'mpe', 'vob', 'flv', 'f4v',
] as const;

export const AUDIO_EXTENSIONS = [
  'mp3', 'm4a', 'm4b', 'aac', 'adts', 'wav', 'wave', 'flac',
  'ogg', 'oga', 'opus', 'amr', 'awb', 'mka',
] as const;

const videoExtensions = new Set<string>(VIDEO_EXTENSIONS);
const audioExtensions = new Set<string>(AUDIO_EXTENSIONS);

type MediaFile = { name: string; mimeType?: string | null };

function extensionOf(name: string): string {
  return name.split(/[?#]/)[0].trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
}

export function hasVideoExtension(name: string): boolean {
  return videoExtensions.has(extensionOf(name));
}

function normalizedMime(file: MediaFile): string {
  return file.mimeType?.split(';')[0].trim().toLowerCase() ?? '';
}

export function isVideoFile(file: MediaFile): boolean {
  const mime = normalizedMime(file);
  return hasVideoExtension(file.name) || mime.startsWith('video/') ||
    mime === 'application/mp4' || mime === 'application/x-matroska';
}

export function isBackgroundMediaFile(file: MediaFile): boolean {
  const extension = extensionOf(file.name);
  const mime = normalizedMime(file);
  return isVideoFile(file) || audioExtensions.has(extension) ||
    mime.startsWith('audio/') || mime === 'application/ogg';
}

export function mediaPlaybackError(details?: string): string {
  const explanation = 'Could not play this file. It may be inaccessible, damaged, or use a codec not supported by this Android device.';
  return details ? `${explanation}\n${details}` : explanation;
}
