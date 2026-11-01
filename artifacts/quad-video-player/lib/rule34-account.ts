import * as SecureStore from 'expo-secure-store';

const KEY = 'quad.rule34.api-credentials.v1';

export type Rule34Credentials = { userId: string; apiKey: string };
export type Rule34AccountSummary = { userId: string };

export async function readRule34Credentials(): Promise<Rule34Credentials | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (typeof value.userId !== 'string' || !/^\d{1,20}$/.test(value.userId) ||
      typeof value.apiKey !== 'string' || !value.apiKey.trim() || value.apiKey.length > 256) {
      throw new Error();
    }
    return { userId: value.userId, apiKey: value.apiKey };
  } catch { throw new Error('The saved Rule34 API credentials are invalid. Remove them and enter them again.'); }
}

export async function saveRule34Credentials(value: Rule34Credentials): Promise<void> {
  const userId = value.userId.trim();
  const apiKey = value.apiKey.trim();
  if (!/^\d{1,20}$/.test(userId)) throw new Error('Enter the numeric user ID shown in your Rule34 API settings.');
  if (!apiKey || apiKey.length > 256 || /[\r\n]/.test(apiKey)) throw new Error('Enter a valid Rule34 API key.');
  await SecureStore.setItemAsync(KEY, JSON.stringify({ userId, apiKey }));
}

export async function removeRule34Credentials(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}

export async function rule34AccountSummary(): Promise<Rule34AccountSummary | null> {
  const credentials = await readRule34Credentials();
  return credentials ? { userId: credentials.userId } : null;
}
