import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(new URL('../package.json', import.meta.url));
async function load(name, modules = {}, globals = {}) {
  const source = await readFile(new URL(`../${name}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX,
  } });
  const exports = {};
  vm.runInNewContext(outputText, { exports, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    require(name) { assert.ok(name in modules, `Unexpected import ${name}`); return modules[name]; }, ...globals });
  return exports;
}
const core = await load('lib/online-sources.ts', { 'fast-xml-parser': require('fast-xml-parser'), htmlparser2: require('htmlparser2') });
const oauth = await load('lib/reddit-oauth.ts');
const plain = (value) => JSON.parse(JSON.stringify(value));
const board = core.parseOnlineSource({ id: 'board', name: 'Scenery', kind: 'booru',
  board: 'landscapes.booru.org', tags: 'blue_sky -rain', safeOnly: true });
const reddit = core.parseOnlineSource({ id: 'reddit', name: 'Animals', kind: 'reddit', subreddits: 'aww, cats', safeOnly: true });
const rule34 = core.parseOnlineSource({ id: 'rule34', name: 'Foxes', kind: 'rule34', tags: 'fox landscape', safeOnly: true });
const e621 = core.parseOnlineSource({ id: 'e621', name: 'Wildlife', kind: 'e621', tags: 'fox landscape', safeOnly: true });
test('board addresses are restricted to HTTPS booru.org-hosted boards', () => {
  assert.equal(core.normalizeBoard('landscapes.booru.org/index.php?page=post'), 'https://landscapes.booru.org');
  for (const value of ['http://landscapes.booru.org', 'https://booru.org.evil.test', 'https://x.booru.org@evil.test',
    'https://localhost', 'https://x.booru.org:444', 'https://127.0.0.1']) assert.throws(() => core.normalizeBoard(value));
});
test('tags and pagination are encoded without changing their search syntax', () => {
  const url = new URL(core.booruSearchUrl(board, 2));
  assert.equal(url.searchParams.get('tags'), 'blue_sky -rain rating:safe');
  assert.equal(url.searchParams.get('pid'), '40');
  assert.equal(url.searchParams.get('page'), 'post');
  assert.equal(url.searchParams.get('s'), 'list');
});
test('Rule34 and e621 use safe-rated site APIs with their own tag syntax', () => {
  const rule34Url = new URL(core.rule34SearchUrl(rule34, 2, { userId: '12345', apiKey: 'test-key' }));
  assert.equal(rule34Url.hostname, 'api.rule34.xxx');
  assert.equal(rule34Url.searchParams.get('tags'), 'fox landscape rating:s');
  assert.equal(rule34Url.searchParams.get('pid'), '2');
  assert.equal(rule34Url.searchParams.get('user_id'), '12345');
  assert.equal(rule34Url.searchParams.get('api_key'), 'test-key');
  const e621Url = new URL(core.e621SearchUrl(e621, 1));
  assert.equal(e621Url.hostname, 'e621.net');
  assert.equal(e621Url.pathname, '/posts.json');
  assert.equal(e621Url.searchParams.get('tags'), 'fox landscape rating:safe');
  assert.equal(e621Url.searchParams.get('limit'), '40');
});
const thumb = (id, rating = 'Safe', path = '') => `<span class="thumb"><a href="${path || `index.php?page=post&amp;s=view&amp;id=${id}`}"><img src="https://img.booru.org/board/thumbnails/1/thumbnail_hash.jpg" title="blue_sky score:0 rating:${rating}"/></a></span>`;
const fastPacing = { setTimeout: (callback, ms, ...args) => setTimeout(callback, ms === 1500 ? 0 : ms, ...args) };
test('hosted-board HTML listings decode links and enforce board-local post IDs and ratings', () => {
  const listing = core.parseBooruListing(`${thumb(1)}${thumb(2, 'Explicit')}${thumb(3, 'Safe', 'https://evil.test/?page=post&s=view&id=3')}`, board);
  assert.equal(listing.length, 1);
  assert.equal(listing[0].postUrl, 'https://landscapes.booru.org/index.php?page=post&s=view&id=1');
  assert.equal(listing[0].name, 'blue_sky');
});
test('original GIF/PNG URL is read from the post, never inferred from a JPEG thumbnail', () => {
  const post = core.parseBooruListing(thumb(1), board)[0];
  for (const extension of ['gif', 'png']) {
    const media = core.parseBooruOriginal(`<img id="image" src="http://img.booru.org/board/images/1/hash.${extension}?x=1&amp;y=2">`, board, post);
    assert.equal(media.uri, `https://img.booru.org/board/images/1/hash.${extension}?x=1&y=2`);
    assert.equal(media.kind, 'image');
    assert.match(media.preview, /thumbnail_hash.jpg$/);
  }
});
test('public empty listings are accepted without mistaking login/challenge pages for empty results', () => {
  assert.equal(core.parseBooruListing('<h1>Nobody here but us chickens!</h1><footer>Running Gelbooru 0.1</footer>', board).length, 0);
  for (const text of ['<html>Sign in to continue</html>', '<title>Just a moment...</title>', '<html>Welcome</html>']) {
    assert.throws(() => core.parseBooruListing(text, board));
  }
});
test('original-image parser never substitutes an advertisement or unsafe address', () => {
  const post = core.parseBooruListing(thumb(1), board)[0];
  for (const text of ['<img id="advertisement" src="https://example.com/ad.jpg">',
    '<img id="image" src="https://127.0.0.1/private.jpg">']) assert.throws(() => core.parseBooruOriginal(text, board, post));
});
test('HTML source fetching resolves originals with bounded concurrency and stable order', async () => {
  let active = 0, maximum = 0;
  const client = await load('lib/online-sources.ts', { 'fast-xml-parser': require('fast-xml-parser'), htmlparser2: require('htmlparser2') }, {
    ...fastPacing,
    fetch: async (url) => {
      if (url.includes('s=list')) return { ok: true, text: async () => Array.from({ length: 8 }, (_, i) => thumb(i + 1)).join('') };
      active++; maximum = Math.max(maximum, active);
      await new Promise(setImmediate);
      active--;
      return { ok: true, text: async () => `<img id="image" src="https://img.booru.org/${new URL(url).searchParams.get('id')}.gif">` };
    },
  });
  const progress = [];
  const page = await client.fetchSourcePage(board, 0, () => assert.fail('Unexpected Reddit request'), undefined, (items) => progress.push(items.length));
  assert.equal(page.items.length, 8); assert.equal(maximum, 1);
  assert.deepEqual(progress, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(plain(page.items.map((item) => item.id)), Array.from({ length: 8 }, (_, i) => `board:${i + 1}`));
});
test('rate limiting stops detail lookups rather than retrying all remaining posts', async () => {
  let calls = 0;
  const client = await load('lib/online-sources.ts', { 'fast-xml-parser': require('fast-xml-parser'), htmlparser2: require('htmlparser2') }, {
    ...fastPacing,
    fetch: async (url) => {
      calls++;
      return url.includes('s=list') ? { ok: true, text: async () => Array.from({ length: 20 }, (_, i) => thumb(i + 1)).join('') } :
        { ok: false, status: 429 };
    },
  });
  await assert.rejects(client.fetchSourcePage(board, 0, () => assert.fail('Unexpected Reddit request')), /rate-limited/);
  assert.ok(calls <= 4);
});
const liveBoard = process.argv.find((arg) => arg.startsWith('--live-board='))?.slice('--live-board='.length);
if (liveBoard) test('live public board returns original media URLs, not DAPI or guessed thumbnail URLs', { timeout: 120000 }, async () => {
  const client = await load('lib/online-sources.ts', { 'fast-xml-parser': require('fast-xml-parser'), htmlparser2: require('htmlparser2') }, { fetch });
  const source = client.parseOnlineSource({ id: 'live-test', name: 'Live check', kind: 'booru', board: liveBoard, safeOnly: true });
  const page = await client.fetchSourcePage(source, 0, () => assert.fail('Unexpected Reddit request'));
  assert.ok(page.items.length > 0, 'Expected publicly available safe-rated posts');
  assert.ok(page.items.every((item) => item.uri.startsWith('https://') && !item.uri.includes('/thumbnails/')));
  const head = await fetch(page.items[0].uri, { method: 'HEAD', signal: AbortSignal.timeout(12000) });
  assert.ok(head.ok, `Original media HEAD returned ${head.status}`);
  assert.match(head.headers.get('content-type') ?? '', /image|video/);
  console.log(`Live check: ${page.items.length} originals resolved; first original HTTP ${head.status}. No media bodies downloaded.`);
});
test('classic booru XML yields HTTPS image/GIF URLs with post attribution', () => {
  const page = core.parseBooruPage('<posts><post id="1" rating="s" tags="sky" file_url="http://img.booru.org/a.gif?x=1&amp;y=2" /></posts>', board, 0);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].uri, 'https://img.booru.org/a.gif?x=1&y=2');
  assert.match(page.items[0].postUrl, /id=1$/);
});
test('Rule34 and e621 API results map originals, previews, ratings, and video formats', () => {
  const rule34Posts = [
    { id: 41, rating: 's', file_url: 'https://img.rule34.xxx/images/safe.jpg',
      preview_url: 'https://img.rule34.xxx/previews/safe.jpg', tags: 'fox landscape' },
    { id: 42, rating: 's', file_url: 'https://img.rule34.xxx/images/loop.webm',
      preview_url: 'https://img.rule34.xxx/previews/loop.jpg', tags: 'fox animation' },
    { id: 43, rating: 'e', file_url: 'https://img.rule34.xxx/images/unsafe.jpg', tags: 'fox' },
  ];
  const parsedRule34 = core.parseRemoteBooruPage(rule34Posts, rule34, 0);
  assert.equal(parsedRule34.items.length, 2);
  assert.equal(parsedRule34.items[1].kind, 'video');
  assert.equal(parsedRule34.items[1].preview, rule34Posts[1].preview_url);
  assert.equal(parsedRule34.items[0].postUrl, 'https://rule34.xxx/index.php?page=post&s=view&id=41');
  assert.throws(() => core.parseRemoteBooruPage('Missing authentication. Go to api.rule34.xxx for more information.',
    rule34, 0), /requires an API user ID and key/);

  const parsedE621 = core.parseRemoteBooruPage({ posts: [
    { id: 51, rating: 's', file: { url: 'https://static1.e621.net/data/file.mp4' },
      preview: { url: 'https://static1.e621.net/data/preview.jpg' }, tags: { general: ['fox', 'landscape'] } },
    { id: 52, rating: 'q', file: { url: 'https://static1.e621.net/data/unsafe.jpg' }, tags: { general: ['fox'] } },
  ] }, e621, 0);
  assert.equal(parsedE621.items.length, 1);
  assert.equal(parsedE621.items[0].kind, 'video');
  assert.equal(parsedE621.items[0].preview, 'https://static1.e621.net/data/preview.jpg');
  assert.equal(parsedE621.items[0].postUrl, 'https://e621.net/posts/51');
});
test('Rule34 authenticated fetch sends credentials only to its official HTTPS API', async () => {
  let requested;
  const fastApi = { ...fastPacing,
    setTimeout: (callback, ms, ...args) => setTimeout(callback, ms === 1000 || ms === 1500 ? 0 : ms, ...args),
  };
  const client = await load('lib/online-sources.ts',
    { 'fast-xml-parser': require('fast-xml-parser'), htmlparser2: require('htmlparser2') },
    { ...fastApi, fetch: async (url) => {
      requested = new URL(url);
      return { ok: true, status: 200, text: async () => JSON.stringify([{ id: 61, rating: 's',
        file_url: 'https://img.rule34.xxx/images/result.gif', tags: 'fox' }]) };
    } });
  const page = await client.fetchSourcePage(rule34, 0, () => assert.fail('Unexpected Reddit request'),
    undefined, undefined, { userId: '12345', apiKey: 'private-test-value' });
  assert.equal(page.items.length, 1);
  assert.equal(requested.protocol, 'https:');
  assert.equal(requested.hostname, 'api.rule34.xxx');
  assert.equal(requested.searchParams.get('api_key'), 'private-test-value');
});
test('client safe filtering excludes unknown ratings while allowing safe video files', () => {
  const data = [{ id: 1, rating: 'e', file_url: 'https://img.booru.org/a.jpg' },
    { id: 2, file_url: 'https://img.booru.org/b.gif' }, { id: 3, rating: 's', file_url: 'https://img.booru.org/c.webm' }];
  assert.equal(core.parseBooruPage(JSON.stringify(data), board, 0).items.length, 1);
  assert.equal(core.parseBooruPage(JSON.stringify(data), { ...board, safeOnly: false }, 0).items.length, 3);
  assert.equal(core.parseBooruPage(JSON.stringify(data), board, 0).items[0].uri, 'https://img.booru.org/c.webm');
});
test('empty feeds are valid, but HTML challenges and malformed API responses are errors', () => {
  assert.equal(core.parseBooruPage('<posts/>', board, 0).items.length, 0);
  for (const text of ['<html>Login required</html>', 'not XML', '{"success":false}', '{"error":"disabled"}', '<response/>']) {
    assert.throws(() => core.parseBooruPage(text, board, 0));
  }
});
test('multiple subreddit selections normalize and cursor values stay constrained', () => {
  assert.equal(core.normalizeSubreddits('r/Aww, cats + aww'), 'aww+cats');
  assert.match(core.redditListingPath(reddit, 't3_abc'), /after=t3_abc/);
  assert.doesNotMatch(core.redditListingPath(reddit, 'https://evil.test'), /after=/);
  assert.throws(() => core.normalizeSubreddits('../api/private'));
});
test('Reddit images, GIF galleries and native videos retain correct media types', () => {
  const post = (data) => ({ data: { id: 'base', title: 'Post', permalink: '/r/aww/comments/base/example/', ...data } });
  const page = core.parseRedditPage({ data: { after: 't3_next', children: [
    post({ id: 'image', url: 'https://i.redd.it/a.jpg' }),
    post({ id: 'gif', gallery_data: { items: [{ media_id: 'g' }] },
      media_metadata: { g: { status: 'valid', s: { gif: 'https://i.redd.it/a.gif' } } } }),
    post({ id: 'video', secure_media: { reddit_video: { hls_url: 'https://v.redd.it/a/HLSPlaylist.m3u8',
      fallback_url: 'https://v.redd.it/a/DASH_720.mp4' } } }),
    post({ id: 'external', url: 'https://example.com/article', thumbnail: 'https://i.redd.it/thumb.jpg' }),
  ] } }, reddit);
  assert.deepEqual(plain(page.items.map((item) => item.kind)), ['image', 'image', 'video']);
  assert.match(page.items[2].uri, /HLSPlaylist/); // Retains adaptive audio instead of silent fallback MP4.
  assert.equal(page.hasMore, true);
});
test('removed, filtered, and unsafe crossposted media is not displayed', () => {
  const posts = [
    { id: 'removed', removed_by_category: 'deleted', url: 'https://i.redd.it/a.jpg' },
    { id: 'adult', over_18: true, url: 'https://i.redd.it/b.jpg' },
    { id: 'cross', crosspost_parent_list: [{ over_18: true, url: 'https://i.redd.it/c.jpg' }] },
  ];
  assert.equal(core.parseRedditPage({ data: { children: posts.map((data) => ({ data })) } }, reddit).items.length, 0);
});
test('media URLs never allow local-network addresses, HTTP, or embedded credentials', () => {
  for (const url of ['http://example.com/a.jpg', 'https://localhost/a', 'https://127.0.0.1/a',
    'https://[::1]/a', 'https://user:password@example.com/a', 'file:///tmp/a']) assert.equal(core.publicMediaUrl(url), null);
  assert.equal(core.publicMediaUrl('https://i.redd.it/a.gif'), 'https://i.redd.it/a.gif');
});
test('OAuth requests minimal read scopes and exact native callback matching', () => {
  const url = new URL(oauth.redditAuthorizationUrl('public_client_id', 'test-state'));
  assert.equal(url.searchParams.get('scope'), 'identity read');
  assert.equal(url.searchParams.get('redirect_uri'), oauth.REDDIT_REDIRECT);
  assert.equal(oauth.redditAuthorizationCode(`${oauth.REDDIT_REDIRECT}?code=example&state=test-state`, 'test-state'), 'example');
  for (const callback of [`${oauth.REDDIT_REDIRECT}?code=x&state=wrong`,
    'https://evil.test/?code=x&state=test-state', `${oauth.REDDIT_REDIRECT}?error=access_denied&state=test-state`]) {
    assert.throws(() => oauth.redditAuthorizationCode(callback, 'test-state'));
  }
  assert.equal(oauth.redditBasicAuth('public_client_id'), `Basic ${Buffer.from('public_client_id:').toString('base64')}`);
});
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, async json() { return data; } });
async function accountHarness(options = {}) {
  let stored = options.stored ?? null;
  let browserUrl;
  const calls = [];
  const module = await load('lib/reddit-account.ts', {
    './reddit-oauth': oauth,
    'expo-crypto': { randomUUID: () => 'csrf-test-state' },
    'expo-secure-store': {
      async getItemAsync() { return stored; },
      async setItemAsync(_key, value) { stored = value; },
      async deleteItemAsync() { stored = null; },
    },
    'expo-web-browser': { async openAuthSessionAsync(url) {
      browserUrl = url;
      return options.browser ?? { type: 'success', url: `${oauth.REDDIT_REDIRECT}?code=test-code&state=csrf-test-state` };
    } },
  }, {
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (options.fetch) return options.fetch(url, init);
      if (url.endsWith('access_token')) return response({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh',
        expires_in: 3600, scope: 'identity read' });
      if (url.endsWith('/me')) return response({ name: 'test_account' });
      if (url.endsWith('revoke_token')) return response(null, options.revokeFails ? 503 : 200);
      return response({ data: { children: [], after: null } });
    },
  });
  return { module, calls, get stored() { return stored; }, get browserUrl() { return browserUrl; } };
}
test('canceling sign-in never stores tokens or makes API calls', async () => {
  const h = await accountHarness({ browser: { type: 'cancel' } });
  assert.equal(await h.module.connectReddit('public_client_id'), null);
  assert.equal(h.stored, null); assert.equal(h.calls.length, 0);
});
test('successful sign-in uses native browser consent and secure token storage', async () => {
  const h = await accountHarness();
  assert.equal(await h.module.connectReddit('public_client_id'), 'test_account');
  assert.equal(await h.module.redditAccountName(), 'test_account');
  assert.match(h.browserUrl, /^https:\/\/www\.reddit\.com\/api\/v1\/authorize/);
  assert.equal(JSON.parse(h.stored).refreshToken, 'synthetic-refresh');
  assert.doesNotMatch(h.calls[0].url, /test-code|synthetic/);
  assert.equal(new URLSearchParams(h.calls[0].init.body).has('client_secret'), false);
});
test('a forged callback cannot exchange a code or change stored credentials', async () => {
  const h = await accountHarness({ browser: { type: 'success', url: `${oauth.REDDIT_REDIRECT}?code=x&state=forged` } });
  await assert.rejects(h.module.connectReddit('public_client_id'), /verified/);
  assert.equal(h.calls.length, 0); assert.equal(h.stored, null);
});
test('unlinked Reddit fails explicitly without anonymous scraping fallback', async () => {
  const h = await accountHarness();
  await assert.rejects(h.module.redditGet('/r/aww/hot.json?limit=40'), /not linked/);
  assert.equal(h.calls.length, 0);
});
test('expired concurrent requests refresh once and keep bearer tokens on oauth.reddit.com', async () => {
  const h = await accountHarness({ stored: JSON.stringify({ clientId: 'public_client_id', accessToken: 'old',
    refreshToken: 'synthetic-refresh', expires: 0, username: 'test_account' }) });
  await Promise.all([h.module.redditGet('/r/aww/hot.json?limit=40'), h.module.redditGet('/r/cats/new.json?limit=40')]);
  assert.equal(h.calls.filter((call) => call.url.endsWith('access_token')).length, 1);
  assert.equal(h.calls.filter((call) => call.url.startsWith('https://oauth.reddit.com/r/')).length, 2);
  await assert.rejects(h.module.redditGet('https://evil.test/'), /Unsupported/);
});
test('disconnect clears device credentials even if online revocation fails', async () => {
  const h = await accountHarness({ revokeFails: true });
  await h.module.connectReddit('public_client_id');
  assert.equal(await h.module.disconnectReddit(), false);
  assert.equal(h.stored, null);
});
test('disconnect can remove a damaged secure-store record', async () => {
  const h = await accountHarness({ stored: 'not-json' });
  assert.equal(await h.module.disconnectReddit(), false);
  assert.equal(h.stored, null);
});
test('OAuth deep links return to the app without routing auth parameters into screens', async () => {
  const intent = await load('app/+native-intent.tsx');
  assert.equal(intent.redirectSystemPath({ path: `${oauth.REDDIT_REDIRECT}?code=x&state=y`, initial: false }), '/');
  assert.equal(intent.redirectSystemPath({ path: '/normal-route', initial: false }), '/normal-route');
});
test('online session streams never reach Android local-file grant inspection', async () => {
  const inspected = [];
  const access = await load('lib/session-media.ts', {
    expo: { requireOptionalNativeModule: () => ({ async inspectSessionMedia(uris) {
      inspected.push(...uris); return uris.map((uri) => ({ uri, readable: true, persistent: true }));
    } }) },
    'react-native': { Platform: { OS: 'android' } }, './online-sources': core,
  });
  const results = await access.inspectSessionMedia(['content://files/local.mp4', 'https://v.redd.it/a/HLSPlaylist.m3u8'], true);
  assert.deepEqual(plain(inspected), ['content://files/local.mp4']);
  assert.equal(results.length, 2);
  assert.ok(results.every((item) => item.readable));
});
test('disconnect during token refresh cannot re-create removed credentials', async () => {
  let finishRefresh;
  const pending = new Promise((resolve) => { finishRefresh = resolve; });
  const h = await accountHarness({ stored: JSON.stringify({ clientId: 'public_client_id', accessToken: 'old',
    refreshToken: 'synthetic-refresh', expires: 0, username: 'test_account' }),
    fetch: async (url) => url.endsWith('access_token') ? pending : response(null),
  });
  const request = h.module.redditGet('/r/aww/hot.json?limit=40');
  const rejected = assert.rejects(request, /removed/);
  await new Promise(setImmediate);
  await h.module.disconnectReddit();
  finishRefresh(response({ access_token: 'synthetic-refreshed', expires_in: 3600, scope: 'read' }));
  await rejected;
  assert.equal(h.stored, null);
});
test('real source provider keeps searches independent and ignores late deleted results', async () => {
  const hooks = [];
  let cursor = 0, failWrite = false, saved = null;
  const pending = [];
  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    useRef(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
    useState(initial) {
      const i = cursor++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial;
      return [hooks[i], (value) => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }];
    },
    useEffect() {}, useCallback: (callback) => callback,
  };
  const provider = await load('hooks/useOnlineSources.tsx', {
    react: { ...react, __esModule: true, default: react },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    '@react-native-async-storage/async-storage': {
      async getItem() { return saved; }, async setItem(_key, value) { if (failWrite) throw new Error('Storage full'); saved = value; },
    },
    '@/lib/reddit-account': { redditGet() { assert.fail('Unexpected request'); } },
    '@/lib/rule34-account': { async readRule34Credentials() { return null; } },
    '@/lib/online-sources': { ...core, fetchSourcePage: (source, next) =>
      new Promise((resolve) => pending.push({ id: source.id, next, resolve })) },
  });
  function render() { cursor = 0; return provider.OnlineSourcesProvider({ children: null }).props.value; }
  let api = render();
  await api.retryStorage(); api = render();
  await api.saveSource(board);
  await api.saveSource({ ...board, id: 'second', name: 'Other sky', tags: 'sunset' });
  assert.equal(JSON.parse(saved).length, 2);
  const item = (uri) => ({ id: uri, uri, kind: 'image', name: 'Photo', postUrl: 'https://example.com/post' });
  pending.find((request) => request.id === 'board').resolve({ items: [item('https://img.booru.org/a.jpg')], cursor: 1, hasMore: true });
  await new Promise(setImmediate); api = render();
  assert.equal(api.results.board.images.length, 1);
  assert.equal(api.results.second.items.length, 0);
  const more = api.refresh('board', true);
  pending.find((request) => request.id === 'board' && request.next === 1).resolve({
    items: [item('https://img.booru.org/a.jpg'), item('https://img.booru.org/b.gif')], cursor: 2, hasMore: false,
  });
  await more; api = render();
  assert.equal(api.results.board.items.length, 2);
  await api.removeSource('second');
  pending.find((request) => request.id === 'second').resolve({ items: [item('https://img.booru.org/late.jpg')], cursor: null, hasMore: false });
  await new Promise(setImmediate); api = render();
  assert.equal(api.results.second, undefined);
  assert.equal(api.sources.length, 1);
  failWrite = true;
  await assert.rejects(api.saveSource({ ...board, tags: 'changed' }), /Storage full/);
  api = render();
  assert.equal(api.sources[0].tags, 'blue_sky -rain');
});
