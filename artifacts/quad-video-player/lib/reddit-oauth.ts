export const REDDIT_REDIRECT = 'com.mochi.quadvideoplayer://oauth/reddit';
export function validRedditClientId(value: string): string {
  const id = value.trim();
  if (!/^[a-z0-9_-]{5,100}$/i.test(id)) throw new Error('Enter the public client ID of an approved Reddit installed app. Do not enter a client secret.');
  return id;
}
export function redditAuthorizationUrl(clientId: string, state: string): string {
  return `https://www.reddit.com/api/v1/authorize.compact?${new URLSearchParams({
    client_id: validRedditClientId(clientId), response_type: 'code', state,
    redirect_uri: REDDIT_REDIRECT, duration: 'permanent', scope: 'identity read',
  })}`;
}
export function redditAuthorizationCode(callback: string, expectedState: string): string {
  const url = new URL(callback);
  const expected = new URL(REDDIT_REDIRECT);
  if (url.protocol !== expected.protocol || url.host !== expected.host || url.pathname !== expected.pathname ||
    url.username || url.password || url.searchParams.get('state') !== expectedState) throw new Error('Reddit sign-in could not be verified. Please start again.');
  if (url.searchParams.get('error')) throw new Error('Reddit sign-in was declined or could not be authorized.');
  const code = url.searchParams.get('code');
  if (!code) throw new Error('Reddit did not return an authorization code.');
  return code;
}
export function redditBasicAuth(clientId: string): string {
  const input = `${validRedditClientId(clientId)}:`;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < input.length; i += 3) {
    const a = input.charCodeAt(i), b = input.charCodeAt(i + 1), c = input.charCodeAt(i + 2);
    const n = (a << 16) | ((b || 0) << 8) | (c || 0);
    result += alphabet[(n >>> 18) & 63] + alphabet[(n >>> 12) & 63] +
      (i + 1 < input.length ? alphabet[(n >>> 6) & 63] : '=') +
      (i + 2 < input.length ? alphabet[n & 63] : '=');
  }
  return `Basic ${result}`;
}
