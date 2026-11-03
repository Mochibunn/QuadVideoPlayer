import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { GameText as Text } from '@/components/GameText';
import { useColors } from '@/hooks/useColors';
import {
  readRule34Credentials, removeRule34Credentials, saveRule34Credentials,
  type Rule34AccountSummary,
} from '@/lib/rule34-account';

const SETTINGS_URL = 'https://rule34.xxx/index.php?page=account&s=options';

export default function Rule34AccountSettings() {
  const colors = useColors();
  const [userId, setUserId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState<Rule34AccountSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void readRule34Credentials().then((credentials) => {
      if (active) {
        setSaved(credentials ? { userId: credentials.userId } : null);
        setUserId(credentials?.userId ?? '');
      }
    }).catch((error) => {
      if (active) Alert.alert('Rule34 credentials unavailable',
        error instanceof Error ? error.message : 'Could not read secure storage.');
    }).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  async function save() {
    if (busy || !loaded) return;
    setBusy(true);
    try {
      const previous = await readRule34Credentials();
      await saveRule34Credentials({ userId, apiKey: apiKey.trim() || previous?.apiKey || '' });
      setSaved({ userId: userId.trim() });
      setUserId(userId.trim());
      setApiKey('');
      Alert.alert('Rule34 API connected', 'Your API key is stored securely on this device.');
    } catch (error) {
      Alert.alert('Could not save Rule34 access', error instanceof Error ? error.message : 'Check the user ID and API key.');
    } finally { setBusy(false); }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await removeRule34Credentials();
      setSaved(null); setUserId(''); setApiKey('');
    } catch {
      Alert.alert('Could not remove Rule34 access', 'The saved API key remains on this device.');
    } finally { setBusy(false); }
  }

  const button = (title: string, onPress: () => void, primary = false) => (
    <Pressable accessibilityRole="button" disabled={!loaded || busy} onPress={onPress}
      style={[styles.button, { borderColor: primary ? colors.primary : colors.border,
        backgroundColor: primary ? colors.primary : colors.secondary, opacity: !loaded || busy ? 0.55 : 1 }]}>
      <Text style={{ color: primary ? colors.primaryForeground : colors.foreground, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
  const inputStyle = [styles.input, { color: colors.foreground, borderColor: colors.border }];

  return (
    <View style={[styles.section, { borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>Rule34 API access</Text>
      <Text style={[styles.description, { color: colors.mutedForeground }]}>
        Create an API key in your Rule34 account settings, then enter its numeric user ID and API key here.
        The key stays in Android secure storage and is never added to saved sessions.
      </Text>
      <Text style={[styles.status, { color: saved ? colors.primary : colors.mutedForeground }]}>
        {!loaded ? 'Checking secure storage…' : saved ? `Connected · user ${saved.userId}` : 'Not connected'}
      </Text>
      <TextInput accessibilityLabel="Rule34 API user ID" value={userId} onChangeText={setUserId}
        editable={loaded && !busy} keyboardType="number-pad" autoCapitalize="none" autoCorrect={false}
        placeholder="Numeric user ID" placeholderTextColor={colors.mutedForeground} style={inputStyle} />
      <TextInput accessibilityLabel="Rule34 API key" value={apiKey} onChangeText={setApiKey}
        editable={loaded && !busy} secureTextEntry autoCapitalize="none" autoCorrect={false}
        placeholder={saved ? 'API key saved · leave blank to keep it' : 'API key'}
        placeholderTextColor={colors.mutedForeground} style={inputStyle} />
      <View style={styles.actions}>
        {button('Open Rule34 API settings', () => {
          void Linking.openURL(SETTINGS_URL).catch(() => Alert.alert('Could not open Rule34 settings'));
        })}
        {button(saved ? 'Update API access' : 'Save API access', () => void save(), true)}
        {saved && button('Disconnect', () => void remove())}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, gap: 10 },
  title: { fontSize: 14, fontWeight: '700' },
  description: { fontSize: 12, lineHeight: 18 },
  status: { fontSize: 12, fontWeight: '600' },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { minHeight: 42, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, justifyContent: 'center' },
});
