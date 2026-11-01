import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useOnlineSources } from '@/hooks/useOnlineSources';
import { connectReddit, disconnectReddit, redditAccountName } from '@/lib/reddit-account';
import { REDDIT_REDIRECT, validRedditClientId } from '@/lib/reddit-oauth';

const KEY = 'quad.reddit.public-client-id';
export default function RedditAccountSettings() {
  const colors = useColors();
  const { clearRedditResults } = useOnlineSources();
  const [clientId, setClientId] = useState('');
  const [username, setUsername] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    void Promise.all([AsyncStorage.getItem(KEY), redditAccountName()]).then(([id, name]) => {
      if (mounted) { setClientId(id ?? ''); setUsername(name); }
    }).catch(() => {
      if (mounted) Alert.alert('Could not read Reddit settings', 'Your saved connection has not been changed.');
    }).finally(() => { if (mounted) setReady(true); });
    return () => { mounted = false; };
  }, []);
  async function link() {
    if (busy) return;
    setBusy(true);
    try {
      const id = validRedditClientId(clientId);
      await AsyncStorage.setItem(KEY, id); // Public app identifier, never a client secret.
      const name = await connectReddit(id);
      if (name) { setUsername(name); clearRedditResults(true); }
    } catch (error) {
      Alert.alert('Reddit connection unavailable', error instanceof Error ? error.message : 'Please try again.');
    } finally { setBusy(false); }
  }
  async function unlink() {
    setBusy(true);
    try {
      const revoked = await disconnectReddit();
      setUsername(null); clearRedditResults();
      if (!revoked) Alert.alert('Disconnected on this device', 'Online revocation could not complete. You can also revoke access in Reddit’s account permissions.');
    } catch { Alert.alert('Could not disconnect', 'The secure account store could not be updated. Please try again.'); }
    finally { setBusy(false); }
  }
  const button = (label: string, action: () => void) => (
    <Pressable accessibilityRole="button" onPress={action} disabled={!ready || busy}
      style={{ padding: 12, minHeight: 44, borderWidth: 1, borderColor: colors.primary, borderRadius: 10 }}>
      <Text style={{ color: colors.primary }}>{label}</Text>
    </Pressable>
  );
  return <View style={{ gap: 10, paddingVertical: 10 }}>
    <Text style={{ color: colors.foreground, fontWeight: '700', fontSize: 16 }}>Reddit account</Text>
    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
      {username ? `Linked as u/${username}. Read-only access; tokens stay in Android’s secure store.` :
        'Optional setup: Reddit requires an approved installed-app client ID. This is a public app identifier, not your password or a client secret. No Replit account connection or backend is required.'}
    </Text>
    {!username && <>
      <TextInput value={clientId} onChangeText={setClientId} autoCapitalize="none" autoCorrect={false}
        editable={ready && !busy} placeholder="Approved installed-app client ID" placeholderTextColor={colors.mutedForeground}
        accessibilityLabel="Reddit public client ID"
        style={{ color: colors.foreground, borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 12 }} />
      <Text selectable style={{ color: colors.mutedForeground, fontSize: 12 }}>Registered redirect URI: {REDDIT_REDIRECT}</Text>
      {button(busy ? 'Opening Reddit…' : 'Link Reddit account', () => void link())}
      {button('Reddit API setup requirements', () => {
        void Linking.openURL('https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki')
          .catch(() => Alert.alert('Could not open browser'));
      })}
      {button('Clear saved Reddit connection', () => void unlink())}
    </>}
    {username && button(busy ? 'Disconnecting…' : 'Disconnect Reddit', () => Alert.alert('Disconnect Reddit?',
      'This removes account tokens from this device and clears fetched Reddit results. Saved searches and local media remain.',
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Disconnect', style: 'destructive', onPress: () => void unlink() }]))}
  </View>;
}
