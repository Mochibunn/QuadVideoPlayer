import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { inspectSessionMedia } from '@/lib/session-media';
import { parseSession, prepareSession, SESSION_KEY, sessionUris, type SessionSnapshot } from '@/lib/sessions';

type Props = {
  capture(): SessionSnapshot;
  restore(session: SessionSnapshot): void;
  canSave: boolean;
  hasCurrent: boolean;
  disabled: boolean;
  compact: boolean;
  onBusyChange(busy: boolean): void;
};
function confirm(title: string, message: string, action: string): Promise<boolean> {
  return new Promise((resolve) => Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
    { text: action, onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) }));
}
export default function SessionControls({ capture, restore, canSave, hasCurrent, disabled, compact, onBusyChange }: Props) {
  const colors = useColors();
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const operation = useRef(false);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(SESSION_KEY).then((raw) => {
      if (raw && active) setSavedAt(parseSession(raw).savedAt);
    }).catch(() => {
      Alert.alert('Saved session unavailable', 'The existing saved session could not be read. You can save the current session to replace it.');
    }).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  async function perform(action: 'save' | 'resume') {
    if (operation.current || busy || disabled || !loaded) return;
    operation.current = true;
    setBusy(true);
    onBusyChange(true);
    try {
      if (action === 'save') {
        if (savedAt && !await confirm('Replace saved session?', 'This replaces your previous saved session with the current mix. Original media files are never changed.', 'Save current')) return;
        // Capture at button confirmation time; do not pause or restart players.
        const snapshot = parseSession(JSON.stringify(capture()));
        const access = await inspectSessionMedia(sessionUris(snapshot), true);
        await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
        setSavedAt(snapshot.savedAt);
        const temporary = access.filter((item) => item.readable && !item.persistent).length;
        const missing = access.filter((item) => !item.readable).length;
        Alert.alert('Session saved', [
          'Your video pool, current quadrants and positions, audio tracks, levels, and settings have been saved.',
          temporary ? `${temporary} file(s) have temporary access. Android may require you to select them again after a restart. Use the system picker or a granted folder for lasting access.` : '',
          missing ? `${missing} file(s) are already unavailable and will be reported when you resume.` : '',
        ].filter(Boolean).join('\n\n'));
      } else {
        if (hasCurrent && !await confirm('Resume saved session?', 'This replaces the current video and audio mix with the saved session. Unsaved changes to this mix will be lost.', 'Resume saved')) return;
        const raw = await AsyncStorage.getItem(SESSION_KEY);
        if (!raw) throw new Error('No session has been saved yet.');
        const original = parseSession(raw);
        const access = await inspectSessionMedia(sessionUris(original), false);
        const prepared = prepareSession(original, new Set(access.filter((item) => item.readable).map((item) => item.uri)));
        if (!prepared.session.pool.length && !prepared.session.audio.length && !prepared.session.slideshow?.pool.length) {
          throw new Error('None of the saved media is currently accessible. Reconnect its storage or restore file permissions, then try Resume again. Your saved session has not been changed.');
        }
        if (prepared.missing) {
          const missingNames = [...original.pool, ...original.audio, ...(original.slideshow?.pool ?? [])]
            .filter((item) => !access.some((a) => a.uri === item.uri && a.readable))
            .map((item) => item.name);
          if (!await confirm('Some saved files are unavailable',
            `${prepared.missing} file(s) were moved, deleted, or no longer have Android access:\n${[...new Set(missingNames)].slice(0, 8).join('\n')}${missingNames.length > 8 ? '\n…' : ''}\n\n${prepared.replacements ? `${prepared.replacements} quadrant(s) will use another available pool video from its beginning. ` : ''}Resume the available media? The saved session will stay unchanged.`,
            'Resume available')) return;
        }
        restore(prepared.session);
      }
    } catch (error) {
      Alert.alert(action === 'save' ? 'Could not save session' : 'Could not resume session',
        error instanceof Error ? error.message : 'Please try again. The saved session was not deliberately removed.');
    } finally {
      operation.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }
  const button = (action: 'save' | 'resume', icon: 'save' | 'rotate-ccw', label: string, unavailable: boolean) =>
    <Pressable accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled: unavailable, busy }} disabled={unavailable}
      onPress={() => void perform(action)}
      style={[styles.button, { backgroundColor: colors.secondary, borderColor: colors.border, opacity: unavailable ? 0.4 : 1 }]}>
      <Feather name={icon} size={17} color={colors.foreground} />
      {!compact && <Text style={[styles.text, { color: colors.foreground }]}>{label}</Text>}
    </Pressable>;
  return (
    <View style={styles.row}>
      {button('save', 'save', 'Save session', disabled || busy || !loaded || !canSave)}
      {button('resume', 'rotate-ccw', 'Resume saved session', disabled || busy || !loaded || !savedAt)}
      {busy && <ActivityIndicator size="small" color={colors.primary} />}
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  button: { minWidth: 42, minHeight: 42, paddingHorizontal: 12, borderWidth: 1, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  text: { fontSize: 12, fontWeight: '600' },
});
