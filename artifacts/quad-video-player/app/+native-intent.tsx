// The browser consumes this OAuth callback. Do not navigate to an unmatched
// /reddit route or forward authorization parameters into app screens.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const url = new URL(path);
    if (url.protocol === 'com.mochi.quadvideoplayer:' && url.host === 'oauth' && url.pathname === '/reddit') return '/';
  } catch { /* Preserve ordinary Expo Router paths. */ }
  return path;
}
