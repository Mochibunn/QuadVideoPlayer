import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { DomUtils, parseDocument } from 'htmlparser2';
import type { Rule34Credentials } from './rule34-account';

export type OnlineSource = {
  id: string; name: string; kind: 'booru' | 'rule34' | 'e621' | 'reddit'; board: string; tags: string;
  subreddits: string; sort: 'hot' | 'new' | 'top'; safeOnly: boolean;
};
export type RemoteMedia = {
  id: string; uri: string; name: string; kind: 'image' | 'video'; postUrl: string; preview?: string;
};
export type SourcePage = { items: RemoteMedia[]; cursor: string | number | null; hasMore: boolean; notice?: string };
export type RemoteMediaMergeMode = 'replace' | 'newer' | 'older';
export function mergeRemoteMedia(existing: RemoteMedia[], incoming: RemoteMedia[],
  mode: RemoteMediaMergeMode = 'replace', limit = 160): RemoteMedia[] {
  const candidates = mode === 'newer' ? [...incoming, ...existing] :
    mode === 'older' ? [...existing, ...incoming] : incoming;
  const seen = new Set<string>();
  const unique = candidates.filter((item) => {
    if (seen.has(item.uri)) return false;
    seen.add(item.uri);
    return true;
  });
  const capacity = Math.max(0, Math.floor(limit));
  if (!capacity) return [];
  if (mode === 'older' && unique.length > capacity) {
    const incomingUris = new Set(incoming.map((item) => item.uri));
    const olderItems = unique.filter((item) => incomingUris.has(item.uri));
    const previousItems = unique.filter((item) => !incomingUris.has(item.uri));
    return [...previousItems.slice(0, Math.max(0, capacity - olderItems.length)), ...olderItems.slice(-capacity)];
  }
  return unique.slice(0, capacity);
}
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
    !['booru', 'rule34', 'e621', 'reddit'].includes(String(v.kind))) {
    throw new Error('Give the source a name and choose its provider.');
  }
  const kind = v.kind as OnlineSource['kind'];
  return {
    id: v.id, name: v.name.trim().slice(0, 100), kind,
    board: kind === 'booru' ? normalizeBoard(String(v.board ?? '')) : '',
    tags: String(v.tags ?? '').trim().slice(0, 1000),
    subreddits: kind === 'reddit' ? normalizeSubreddits(String(v.subreddits ?? '')) : '',
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
  // Hosted booru.org boards run the older HTML-only engine. Its pid is an
  // offset in 20-post pages, not the DAPI page number used by newer engines.
  url.search = new URLSearchParams({ page: 'post', s: 'list', pid: String(Math.max(0, Math.floor(page)) * 20), tags: tags || 'all' }).toString();
  return url.href;
}
function apiTags(source: OnlineSource) {
  const safeTag = source.kind === 'e621' ? 'rating:safe' : 'rating:s';
  return [source.tags, source.safeOnly ? safeTag : ''].filter(Boolean).join(' ');
}
export function rule34SearchUrl(source: OnlineSource, page: number, credentials: Rule34Credentials): string {
  const url = new URL('/index.php', 'https://api.rule34.xxx');
  url.search = new URLSearchParams({
    page: 'dapi', s: 'post', q: 'index', json: '1', limit: '40',
    pid: String(Math.max(0, Math.floor(page))), tags: apiTags(source),
    user_id: credentials.userId, api_key: credentials.apiKey,
  }).toString();
  return url.href;
}
export function e621SearchUrl(source: OnlineSource, page: number): string {
  const url = new URL('/posts.json', 'https://e621.net');
  url.search = new URLSearchParams({
    limit: '40', page: String(Math.max(1, Math.floor(page) + 1)), tags: apiTags(source),
  }).toString();
  return url.href;
}
function upgradeBooruUrl(value: unknown, board: string) {
  return publicMediaUrl(typeof value === 'string' ? value.replace(/^http:\/\//i, 'https://') : value, board);
}
export type BooruListingPost = { id: string; name: string; postUrl: string; preview?: string };
export function parseBooruListing(text: string, source: OnlineSource): BooruListingPost[] {
  const document = parseDocument(text, { decodeEntities: true });
  const board = normalizeBoard(source.board);
  const thumbnails = DomUtils.findAll((node) =>
    node.name === 'span' && (node.attribs.class ?? '').split(/\s+/).includes('thumb'), document.children);
  if (!thumbnails.length) {
    const message = DomUtils.textContent(document);
    if (/Gelbooru/i.test(text) && /Nobody here but us chickens|No (?:images|posts|results)(?: were)? found/i.test(message)) return [];
    throw new Error('This board did not return a public post listing. Sign-in pages and browser challenges are not supported.');
  }
  const posts: BooruListingPost[] = [];
  const seen = new Set<string>();
  for (const thumb of thumbnails) {
    const image = DomUtils.findOne((node) => node.name === 'img', thumb.children);
    const anchor = DomUtils.findOne((node) => node.name === 'a' && !!node.attribs.href, thumb.children);
    if (!image || !anchor) continue;
    let url: URL;
    try { url = new URL(anchor.attribs.href, board); } catch { continue; }
    const id = url.searchParams.get('id');
    if (url.origin !== board || url.searchParams.get('page') !== 'post' ||
      url.searchParams.get('s') !== 'view' || !id || !/^\d+$/.test(id) || seen.has(id)) continue;
    const title = image.attribs.title ?? '';
    const rating = title.match(/\brating:\s*(safe|general|questionable|explicit|[sqeg])\b/i)?.[1]?.toLowerCase();
    if (source.safeOnly && !['s', 'safe', 'g', 'general'].includes(rating ?? '')) continue;
    seen.add(id);
    posts.push({ id, name: title.replace(/\s*(?:score|rating):[\s\S]*$/i, '').trim().slice(0, 200) || `Post ${id}`,
      postUrl: `${board}/index.php?page=post&s=view&id=${id}`,
      preview: upgradeBooruUrl(image.attribs['data-src'] ?? image.attribs.src, board) ?? undefined });
  }
  return posts;
}
export function parseBooruOriginal(text: string, source: OnlineSource, post: BooruListingPost): RemoteMedia {
  const document = parseDocument(text, { decodeEntities: true });
  const image = DomUtils.findOne((node) => node.name === 'img' && node.attribs.id === 'image', document.children);
  const video = DomUtils.findOne((node) => node.name === 'video' && node.attribs.id === 'image', document.children);
  const videoSource = video && DomUtils.findOne((node) => node.name === 'source' && !!node.attribs.src, video.children);
  const uri = upgradeBooruUrl(image?.attribs.src ?? video?.attribs.src ?? videoSource?.attribs.src, normalizeBoard(source.board));
  if (!uri || !/\.(png|jpe?g|gif|webp|avif|bmp|mp4|webm|mov)(?:$|\?)/i.test(uri)) {
    throw new Error('The post did not expose a supported original image or video.');
  }
  return { ...post, id: `${source.id}:${post.id}`, uri, kind: /\.(mp4|webm|mov)(?:$|\?)/i.test(uri) ? 'video' : 'image' };
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
    const kind = uri ? remoteMediaKind(uri) : null;
    if (!uri || !kind) continue;
    items.push({ id: `${source.id}:${post.id ?? uri}`, uri, kind,
      name: String(post.tags || `Post ${post.id ?? ''}`).slice(0, 200),
      postUrl: `${board}/index.php?page=post&s=view&id=${encodeURIComponent(String(post.id ?? ''))}`,
      preview: upgradeBooruUrl(post.preview_url, board) ?? undefined });
  }
  return { items, cursor: page + 1, hasMore: posts.length >= 40 };
}

function remoteMediaKind(uri: string): RemoteMedia['kind'] | null {
  let path = '';
  try { path = new URL(uri).pathname.toLowerCase(); } catch { return null; }
  if (/\.(mp4|webm|mov|m4v|m3u8|mpd)$/.test(path)) return 'video';
  if (/\.(png|jpe?g|gif|webp|avif|bmp|apng)$/.test(path)) return 'image';
  return null;
}
function recordsFromApi(value: unknown): Record<string, any>[] {
  if (Array.isArray(value)) return value.filter((post) => post && typeof post === 'object');
  if (!value || typeof value !== 'object') return [];
  const object = value as Record<string, any>;
  const posts = object.posts ?? object.post;
  if (Array.isArray(posts)) return posts.filter((post) => post && typeof post === 'object');
  if (posts && typeof posts === 'object') return [posts];
  return Object.values(object).filter((post) => post && typeof post === 'object' &&
    (typeof post.id === 'number' || typeof post.id === 'string'));
}
export function parseRemoteBooruPage(value: unknown, source: OnlineSource, page: number): SourcePage {
  if (typeof value === 'string') {
    if (source.kind === 'rule34' && /missing authentication/i.test(value)) {
      throw new Error('Rule34 requires an API user ID and key. Connect them in Online media sources.');
    }
    throw new Error(`${source.kind} returned an error instead of a media listing.`);
  }
  const response = value as Record<string, unknown> | null;
  if (response && typeof response === 'object' &&
    (response.success === false || response.success === 'false')) {
    throw new Error(String(response.message ?? `${source.kind} refused this search.`).slice(0, 240));
  }
  const posts = recordsFromApi(value);
  const items: RemoteMedia[] = [];
  for (const post of posts) {
    const rating = String(post.rating ?? '').toLowerCase();
    if (source.safeOnly && rating !== 's' && rating !== 'safe') continue;
    const uri = publicMediaUrl(post.file?.url ?? post.file_url ?? post.sample?.url ?? post.sample_url);
    const kind = uri ? remoteMediaKind(uri) : null;
    if (!uri || !kind) continue;
    const preview = publicMediaUrl(post.preview?.url ?? post.preview_url ?? post.sample?.url ?? post.sample_url);
    const tags = Array.isArray(post.tags) ? post.tags :
      Object.values(post.tags ?? {}).flatMap((values) => Array.isArray(values) ? values : []);
    const id = String(post.id ?? uri);
    const postUrl = source.kind === 'e621'
      ? `https://e621.net/posts/${encodeURIComponent(id)}`
      : `https://rule34.xxx/index.php?page=post&s=view&id=${encodeURIComponent(id)}`;
    items.push({ id: `${source.id}:${id}`, uri, kind,
      name: (Array.isArray(tags) && tags.length ? tags.join(' ') : `Post ${id}`).slice(0, 200),
      postUrl, ...(preview ? { preview } : {}) });
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
const boardQueues = new Map<string, Promise<void>>();
function boardRequest<T>(board: string, signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  const previous = boardQueues.get(board) ?? Promise.resolve();
  const next = previous.then(async () => {
    if (signal.aborted) throw new Error('The search was canceled.');
    // Share pacing across all searches on a board, not just within one page.
    await new Promise<void>((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); reject(new Error('The search was canceled.')); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, 1500);
      signal.addEventListener('abort', cancel, { once: true });
    });
    return work();
  });
  const tail = next.then(() => undefined, () => undefined);
  boardQueues.set(board, tail);
  void tail.then(() => { if (boardQueues.get(board) === tail) boardQueues.delete(board); });
  return next;
}
const apiQueues = new Map<string, Promise<void>>();
function apiRequest<T>(host: string, signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  const previous = apiQueues.get(host) ?? Promise.resolve();
  const next = previous.then(async () => {
    if (signal.aborted) throw new Error('The search was canceled.');
    await new Promise<void>((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); reject(new Error('The search was canceled.')); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, 1000);
      signal.addEventListener('abort', cancel, { once: true });
    });
    return work();
  });
  const tail = next.then(() => undefined, () => undefined);
  apiQueues.set(host, tail);
  void tail.then(() => { if (apiQueues.get(host) === tail) apiQueues.delete(host); });
  return next;
}
async function fetchBooruApiPage(
  source: OnlineSource, page: number, signal?: AbortSignal, credentials?: Rule34Credentials,
): Promise<SourcePage> {
  const requestSignal = signal ?? new AbortController().signal;
  const e621 = source.kind === 'e621';
  const host = e621 ? 'e621.net' : 'api.rule34.xxx';
  if (!e621 && !credentials) {
    throw new Error('Rule34 API credentials are required. Connect your account in Online media sources.');
  }
  const url = e621 ? e621SearchUrl(source, page) : rule34SearchUrl(source, page, credentials!);
  return apiRequest(host, requestSignal, async () => {
    const response = await fetch(url, { signal: requestSignal,
      headers: { Accept: 'application/json', 'User-Agent': 'QuadVideoPlayer/1.12.0 (Android; read-only)' } });
    if (response.status === 429) throw new Error(`${host} rate-limited this search. Wait before loading more.`);
    if (response.status === 401 || response.status === 403) {
      throw new Error(`${host} denied this public search. Access challenges and sign-in requirements are not bypassed.`);
    }
    if (!response.ok) throw new Error(`${host} returned HTTP ${response.status}.`);
    const text = await response.text();
    if (text.length > 3_000_000) throw new Error(`${host} returned an unexpectedly large response.`);
    let data: unknown;
    try { data = JSON.parse(text); } catch { throw new Error(`${host} returned invalid JSON.`); }
    return parseRemoteBooruPage(data, source, page);
  });
}
export async function fetchSourcePage(source: OnlineSource, cursor: string | number | null,
  redditGet: (path: string) => Promise<unknown>, signal?: AbortSignal,
  onProgress?: (items: RemoteMedia[]) => void, rule34Credentials?: Rule34Credentials): Promise<SourcePage> {
  if (source.kind === 'reddit') return parseRedditPage(await redditGet(redditListingPath(source, cursor)), source);
  if (source.kind === 'rule34' || source.kind === 'e621') {
    const page = typeof cursor === 'number' ? cursor : 0;
    return fetchBooruApiPage(source, page, signal, rule34Credentials);
  }
  if (signal?.aborted) throw new Error('The search was canceled.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  const timer = setTimeout(abort, 90000);
  let fatalError = '';
  const board = normalizeBoard(source.board);
  const readPage = (url: string): Promise<string> => boardRequest(board, controller.signal, async () => {
    if (controller.signal.aborted) throw new Error('The search was canceled or timed out.');
    const request = new AbortController();
    const cancel = () => request.abort();
    controller.signal.addEventListener('abort', cancel);
    const timeout = setTimeout(cancel, 15000);
    try {
      const response = await fetch(url, { signal: request.signal,
        headers: { Accept: 'text/html, application/xhtml+xml;q=0.9', 'User-Agent': 'QuadVideoPlayer/1.10.1 (Android; read-only)' } });
      if (!response.ok) {
        const message = response.status === 429 ? 'The board rate-limited this search. Wait before retrying.' :
          `The board returned HTTP ${response.status}. Its public pages may be unavailable or require permission.`;
        if ([401, 403, 429].includes(response.status)) { fatalError = message; controller.abort(); }
        throw new Error(message);
      }
      const text = await response.text();
      if (text.length > 3_000_000) throw new Error('The board response is too large.');
      return text;
    } catch (error) {
      if (request.signal.aborted) throw new Error(fatalError || (controller.signal.aborted ?
        'The search was canceled or timed out.' : 'The board request timed out. Try again.'));
      throw error;
    } finally {
      clearTimeout(timeout); controller.signal.removeEventListener('abort', cancel);
    }
  });
  try {
    const page = typeof cursor === 'number' ? cursor : 0;
    const text = await readPage(booruSearchUrl(source, page));
    const posts = parseBooruListing(text, source).slice(0, 20);
    const items: (RemoteMedia | undefined)[] = new Array(posts.length);
    let next = 0, failed = 0;
    const errors: string[] = [];
    // Resolve exact original URLs. A thumbnail ending in .jpg can represent a
    // .png or animated .gif; deriving the original by path replacement is wrong.
    await Promise.all(Array.from({ length: Math.min(3, posts.length) }, async () => {
      while (next < posts.length && !controller.signal.aborted) {
        const index = next++;
        try {
          items[index] = parseBooruOriginal(await readPage(posts[index].postUrl), source, posts[index]);
          onProgress?.(items.filter((item): item is RemoteMedia => !!item));
        }
        catch (error) { failed++; errors.push(error instanceof Error ? error.message : String(error)); }
      }
    }));
    if (controller.signal.aborted) throw new Error(fatalError || (signal?.aborted ? 'The search was canceled.' : 'The board search timed out. Try again.'));
    const resolved = items.filter((item): item is RemoteMedia => !!item);
    if (posts.length && !resolved.length) throw new Error(errors[0] || 'The original media could not be loaded.');
    const hasMore = /class=["'][^"']*\bthumb\b/i.test(text) && (
      (text.match(/class=["'][^"']*\bthumb\b/g) ?? []).length >= 20 ||
      [...text.matchAll(/[?&](?:amp;)?pid=(\d+)/g)].some((match) => Number(match[1]) > page * 20));
    return { items: resolved, cursor: page + 1, hasMore,
      ...(failed ? { notice: `${failed} post(s) could not be loaded. Refresh to retry.` } : {}) };
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
