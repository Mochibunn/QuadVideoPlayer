import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { redditAuthorizationCode, redditAuthorizationUrl, redditBasicAuth, REDDIT_REDIRECT, validRedditClientId } from './reddit-oauth';

const KEY = 'quad.reddit.oauth.v1';
const USER_AGENT = 'android:com.mochi.quadvideoplayer:v1.10.0 (personal media reader)';
type Account = { clientId: string; accessToken: string; refreshToken: string; expires: number; username: string };
let generation = 0;
let refreshJob: Promise<Account> | null = null;
let connecting = false;
let secureQueue: Promise<unknown> = Promise.resolve();
function writeAccount(account: Account | null, revision = generation): Promise<void> {
  const operation = secureQueue.catch(() => undefined).then(async () => {
    if (account && revision !== generation) throw new Error('The Reddit connection was removed.');
    if (account) await SecureStore.setItemAsync(KEY, JSON.stringify(account));
    else await SecureStore.deleteItemAsync(KEY);
  });
  secureQueue = operation;
  return operation;
}
async function readAccount(): Promise<Account | null> {
  await secureQueue.catch(() => undefined);
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (typeof value.accessToken !== 'string' || typeof value.clientId !== 'string' ||
      typeof value.refreshToken !== 'string' || typeof value.expires !== 'number' || typeof value.username !== 'string') throw new Error();
    return value;
  } catch { throw new Error('The saved Reddit connection is invalid. Disconnect and sign in again.'); }
}
async function request(url: string, options: RequestInit, json = true) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, ...options.headers } });
    if (!response.ok) throw new Error(response.status === 429 ? 'Reddit rate-limited this request. Wait before retrying.' :
      response.status === 401 ? 'Reddit authorization expired or was revoked. Disconnect and sign in again.' :
      `Reddit returned HTTP ${response.status}. Check app approval and access to this subreddit.`);
    return json ? await response.json() : null;
  } finally { clearTimeout(timer); }
}
async function token(clientId: string, form: Record<string, string>) {
  const value = await request('https://www.reddit.com/api/v1/access_token', { method: 'POST',
    headers: { Authorization: redditBasicAuth(clientId), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString() });
  if (typeof value.access_token !== 'string' || !Number.isFinite(value.expires_in) || value.expires_in <= 0 ||
    (typeof value.scope === 'string' && !value.scope.split(/[ ,]+/).includes('read'))) {
    throw new Error('Reddit did not grant the requested read access. Check your installed-app approval.');
  }
  return value;
}
export async function redditAccountName(): Promise<string | null> { return (await readAccount())?.username ?? null; }
export async function connectReddit(clientIdInput: string): Promise<string | null> {
  if (connecting) throw new Error('A Reddit sign-in is already open.');
  const clientId = validRedditClientId(clientIdInput);
  connecting = true;
  const revision = generation;
  try {
    const state = Crypto.randomUUID();
    const result = await WebBrowser.openAuthSessionAsync(redditAuthorizationUrl(clientId, state), REDDIT_REDIRECT);
    if (result.type !== 'success') return null;
    const code = redditAuthorizationCode(result.url, state);
    const value = await token(clientId, { grant_type: 'authorization_code', code, redirect_uri: REDDIT_REDIRECT });
    if (typeof value.refresh_token !== 'string') throw new Error('Reddit did not grant ongoing access. Please authorize again.');
    const profile = await request('https://oauth.reddit.com/api/v1/me', {
      headers: { Authorization: `Bearer ${value.access_token}` },
    });
    if (typeof profile.name !== 'string') throw new Error('Reddit did not return an account identity.');
    if (revision !== generation) throw new Error('The connection was canceled.');
    await writeAccount({ clientId, accessToken: value.access_token,
      refreshToken: value.refresh_token, expires: Date.now() + value.expires_in * 1000 - 60000, username: profile.name }, revision);
    return profile.name;
  } finally { connecting = false; }
}
async function authorizedAccount(): Promise<Account> {
  const account = await readAccount();
  if (!account) throw new Error('Reddit is not linked. Configure an approved installed-app client ID and sign in under Reddit account.');
  if (account.expires > Date.now()) return account;
  if (refreshJob) return refreshJob;
  const revision = generation;
  refreshJob = (async () => {
    const value = await token(account.clientId, { grant_type: 'refresh_token', refresh_token: account.refreshToken });
    const updated = { ...account, accessToken: value.access_token, refreshToken: value.refresh_token ?? account.refreshToken,
      expires: Date.now() + value.expires_in * 1000 - 60000 };
    if (revision !== generation) throw new Error('The Reddit connection was removed.');
    await writeAccount(updated, revision);
    return updated;
  })();
  try { return await refreshJob; } finally { refreshJob = null; }
}
export async function redditGet(path: string): Promise<unknown> {
  if (!/^\/r\/[a-z0-9_+]+\/(?:new|hot|top)\.json\?/i.test(path)) throw new Error('Unsupported Reddit request.');
  const revision = generation;
  const account = await authorizedAccount();
  const value = await request(`https://oauth.reddit.com${path}`, {
    headers: { Authorization: `Bearer ${account.accessToken}` },
  });
  if (revision !== generation) throw new Error('The Reddit connection was removed.');
  return value;
}
export async function disconnectReddit(): Promise<boolean> {
  generation++;
  let account: Account | null = null;
  let invalid = false;
  try { account = await readAccount(); } catch { invalid = true; }
  await writeAccount(null);
  if (!account) return !invalid;
  try {
    await request('https://www.reddit.com/api/v1/revoke_token', { method: 'POST',
      headers: { Authorization: redditBasicAuth(account.clientId), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: account.refreshToken, token_type_hint: 'refresh_token' }).toString() }, false);
    return true;
  } catch { return false; }
}
