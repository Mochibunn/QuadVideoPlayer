import { XMLParser, XMLValidator } from 'fast-xml-parser';

export type OnlineSource = {
  id: string; name: string; kind: 'booru' | 'reddit'; board: string; tags: string;
  subreddits: string; sort: 'hot' | 'new' | 'top'; safeOnly: boolean;
};
export type RemoteMedia = {
  id: string; uri: string; name: string; kind: 'image' | 'video'; postUrl: string; preview?: string;
};
export type SourcePage = { items: RemoteMedia[]; cursor: string | number | null; hasMore: boolean };
export function publicMediaUrl(value: unknown, base?: string): string | null {
  if (typeof value !== 'string' || !value || value.length > 16000) return null;
  try {
    const url = new URL(value.replace(/&amp;/g, '&'), base);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
      !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) || /(^|\.)(localhost|local|internal)$/i.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}
export function normalizeBoard(value: string): string {
  let url: URL;
  try { url = new URL(value.trim().includes('://') ? value.trim() : `https://${value.trim()}`); }
  catch { throw new Error('Enter the address of a board hosted on booru.org.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.booru\.org$/i.test(url.hostname)) {
    throw new Error('Use an HTTPS board address such as your-board.booru.org, not another booru service.');
  }
  return url.origin;
}
export function normalizeSubreddits(value: string): string {
  const parts = value.trim().replace(/^https:\/\/(?:www\.)?reddit\.com\/r\//i, '')
    .replace(/\/(?:hot|new|top)?\/?$/i, '').split(/[+,\s]+/).map((s) => s.replace(/^r\//i, '')).filter(Boolean);
  if (!parts.length || parts.some((s) => !/^[a-z0-9_]{1,21}$/i.test(s))) {
    throw new Error('Enter subreddit names separated by commas or +, for example EarthPorn + aww.');
  }
  return [...new Set(parts.map((s) => s.toLowerCase()))].join('+');
}
export function parseOnlineSource(value: unknown): OnlineSource {
  if (!value || typeof value !== 'object') throw new Error('Invalid online source.');
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !v.id || typeof v.name !== 'string' || !v.name.trim() ||
    (v.kind !== 'booru' && v.kind !== 'reddit')) throw new Error('Give the source a name and choose its provider.');
  return {
    id: v.id, name: v.name.trim().slice(0, 100), kind: v.kind,
    board: v.kind === 'booru' ? normalizeBoard(String(v.board ?? '')) : '',
    tags: String(v.tags ?? '').trim().slice(0, 1000),
    subreddits: v.kind === 'reddit' ? normalizeSubreddits(String(v.subreddits ?? '')) : '',
    sort: v.sort === 'new' || v.sort === 'top' ? v.sort : 'hot',
    safeOnly: v.safeOnly !== false,
  };
}
export function parseOnlineSources(value: unknown): OnlineSource[] {
  if (!Array.isArray(value)) throw new Error('The saved online sources are invalid.');
  const result = value.map(parseOnlineSource);
  if (new Set(result.map((s) => s.id)).size !== result.length) throw new Error('Online source IDs must be unique.');
  return result;
}
export function booruSearchUrl(source: OnlineSource, page: number): string {
  const url = new URL('/index.php', normalizeBoard(source.board));
  const tags = [source.tags, source.safeOnly ? 'rating:safe' : ''].filter(Boolean).join(' ');
  url.search = new URLSearchParams({ page: 'dapi', s: 'post', q: 'index', limit: '40', pid: String(Math.max(0, Math.floor(page))), tags }).toString();
  return url.href;
}
function upgradeBooruUrl(value: unknown, board: string) {
  return publicMediaUrl(typeof value === 'string' ? value.replace(/^http:\/\//i, 'https://') : value, board);
}
export function parseBooruPage(text: string, source: OnlineSource, page: number): SourcePage {
  let data: any;
  if (/^\s*[\[{]/.test(text)) {
    try { data = JSON.parse(text); } catch { throw new Error('The board returned invalid JSON.'); }
  } else {
    if (/<(?:html|!doctype)/i.test(text) || XMLValidator.validate(text) !== true) {
      throw new Error('This board did not return its public DAPI feed. It may require sign-in, block API access, or be unavailable.');
    }
    data = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', parseAttributeValue: false, processEntities: false }).parse(text);
    if (!Object.prototype.hasOwnProperty.call(data, 'posts')) throw new Error('The board returned an unsupported API response.');
    data = data.posts;
  }
  if (data?.success === false || data?.success === 'false') throw new Error('The board refused this search.');
  if (!Array.isArray(data) && data !== '' && !data?.post &&
    data?.count === undefined && data?.offset === undefined && data?.limit === undefined) {
    throw new Error('The board returned an unsupported API response.');
  }
  const posts = Array.isArray(data) ? data : data?.post ? (Array.isArray(data.post) ? data.post : [data.post]) : [];
  const items: RemoteMedia[] = [];
  const board = normalizeBoard(source.board);
  for (const post of posts) {
    if (source.safeOnly && !['s', 'safe', 'g', 'general'].includes(String(post.rating).toLowerCase())) continue;
    const uri = upgradeBooruUrl(post.file_url ?? post.sample_url, board);
    if (!uri || !/\.(png|jpe?g|gif|webp|avif|bmp)(?:$|\?)/i.test(uri)) continue;
    items.push({ id: `${source.id}:${post.id ?? uri}`, uri, kind: 'image',
      name: String(post.tags || `Post ${post.id ?? ''}`).slice(0, 200),
      postUrl: `${board}/index.php?page=post&s=view&id=${encodeURIComponent(String(post.id ?? ''))}`,
      preview: upgradeBooruUrl(post.preview_url, board) ?? undefined });
  }
  return { items, cursor: page + 1, hasMore: posts.length >= 40 };
}
export function redditListingPath(source: OnlineSource, after?: string | number | null): string {
  const params = new URLSearchParams({ limit: '40', raw_json: '1', t: 'week' });
  if (typeof after === 'string' && /^t3_[a-z0-9]+$/i.test(after)) params.set('after', after);
  return `/r/${normalizeSubreddits(source.subreddits)}/${source.sort}.json?${params}`;
}
export function parseRedditPage(value: unknown, source: OnlineSource): SourcePage {
  const listing = value as any;
  if (!Array.isArray(listing?.data?.children)) throw new Error('Reddit returned an invalid post listing.');
  const items: RemoteMedia[] = [];
  function add(post: any, uriValue: unknown, kind: RemoteMedia['kind'], suffix = '') {
    const uri = publicMediaUrl(uriValue);
    if (!uri) return;
    items.push({ id: `${source.id}:${post.id}${suffix}`, uri, kind,
      name: String(post.title || 'Reddit post').slice(0, 200),
      postUrl: publicMediaUrl(`https://www.reddit.com${post.permalink ?? ''}`) ?? 'https://www.reddit.com',
      preview: publicMediaUrl(post.thumbnail) ?? undefined });
  }
  for (const child of listing.data.children) {
    let post = child?.data;
    if (!post || post.removed_by_category || (source.safeOnly && (post.over_18 || post.spoiler))) continue;
    if (post.crosspost_parent_list?.[0]) {
      const parent = post.crosspost_parent_list[0];
      if (source.safeOnly && (parent.over_18 || parent.spoiler)) continue;
      post = { ...parent, title: post.title, permalink: post.permalink, id: post.id };
    }
    if (post.gallery_data?.items && post.media_metadata) {
      for (const item of post.gallery_data.items) {
        const m = post.media_metadata[item.media_id];
        if (m?.status === 'valid') {
          if (m.s?.gif || m.s?.u) add(post, m.s.gif ?? m.s.u, 'image', `:${item.media_id}`);
          else if (m.s?.mp4) add(post, m.s.mp4, 'video', `:${item.media_id}`);
        }
      }
      continue;
    }
    const video = post.secure_media?.reddit_video ?? post.media?.reddit_video ?? post.preview?.reddit_video_preview;
    if (video) { add(post, video.hls_url ?? video.dash_url ?? video.fallback_url, 'video'); continue; }
    const uri = publicMediaUrl(post.url_overridden_by_dest ?? post.url);
    if (uri && /\.(png|jpe?g|gif|webp|avif)(?:$|\?)/i.test(uri)) add(post, uri, 'image');
    else if (uri && /\.(mp4|webm|mov|m3u8|mpd)(?:$|\?)/i.test(uri)) add(post, uri, 'video');
  }
  const seen = new Set<string>();
  const unique = items.filter((item) => { if (seen.has(item.uri)) return false; seen.add(item.uri); return true; });
  const after = typeof listing.data.after === 'string' && /^t3_[a-z0-9]+$/i.test(listing.data.after) ? listing.data.after : null;
  return { items: unique, cursor: after, hasMore: after !== null };
}
export async function fetchSourcePage(source: OnlineSource, cursor: string | number | null,
  redditGet: (path: string) => Promise<unknown>, signal?: AbortSignal): Promise<SourcePage> {
  if (source.kind === 'reddit') return parseRedditPage(await redditGet(redditListingPath(source, cursor)), source);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  const timer = setTimeout(abort, 15000);
  try {
    const response = await fetch(booruSearchUrl(source, typeof cursor === 'number' ? cursor : 0), {
      signal: controller.signal, headers: { Accept: 'application/xml, application/json;q=0.9', 'User-Agent': 'QuadVideoPlayer/1.10 (Android; read-only)' },
    });
    if (!response.ok) throw new Error(response.status === 429 ? 'The board rate-limited this search. Wait before retrying.' :
      `The board returned HTTP ${response.status}. Its public API may be unavailable or require permission.`);
    const text = await response.text();
    if (text.length > 3_000_000) throw new Error('The board response is too large.');
    return parseBooruPage(text, source, typeof cursor === 'number' ? cursor : 0);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
