import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Crypto from 'expo-crypto';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useColors } from '@/hooks/useColors';
import { useOnlineSources } from '@/hooks/useOnlineSources';
import { parseOnlineSource, type OnlineSource, type RemoteMedia } from '@/lib/online-sources';
import RedditAccountSettings from './RedditAccountSettings';
import Rule34AccountSettings from './Rule34AccountSettings';
import SettingSwitch from '../SettingSwitch';

function draft(): OnlineSource {
  return { id: Crypto.randomUUID(), name: '', kind: 'booru', board: '', tags: '', subreddits: '', sort: 'hot', safeOnly: true };
}
export default function OnlineSourcesPanel({ visible, onClose, onPlayVideos }: {
  visible: boolean; onClose(): void; onPlayVideos(items: RemoteMedia[], name: string): void;
}) {
  const colors = useColors();
  const api = useOnlineSources();
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<OnlineSource | null>(null);
  const [busy, setBusy] = useState(false);
  const source = api.sources.find((s) => s.id === selected) ?? api.sources[0];
  const result = source ? api.results[source.id] : undefined;
  const videos = result?.items.filter((item) => item.kind === 'video') ?? [];
  const label = (text: string, small = false) => <Text style={{ color: small ? colors.mutedForeground : colors.foreground, fontSize: small ? 12 : 14 }}>{text}</Text>;
  const button = (text: string, action: () => void, disabled = false) => (
    <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={action}
      style={[styles.button, { borderColor: colors.primary, opacity: busy || disabled ? 0.5 : 1 }]}>
      <Text style={{ color: colors.primary }}>{text}</Text>
    </Pressable>
  );
  function input(title: string, key: 'name' | 'board' | 'tags' | 'subreddits', hint: string) {
    return <View style={{ gap: 6 }}>{label(title)}<TextInput accessibilityLabel={title}
      value={editing?.[key] ?? ''} placeholder={hint} placeholderTextColor={colors.mutedForeground}
      autoCapitalize="none" autoCorrect={false} editable={!busy}
      onChangeText={(value) => setEditing((old) => old ? { ...old, [key]: value } : old)}
      style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} /></View>;
  }
  async function save() {
    if (!editing || busy) return;
    setBusy(true);
    try {
      const value = parseOnlineSource(editing);
      await api.saveSource(value);
      setSelected(value.id); setEditing(null);
    } catch (error) { Alert.alert('Could not save search', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  function remove() {
    if (!source) return;
    Alert.alert('Remove this online search?', 'Its fetched results will be cleared. Slideshows using it will stop until you choose another source. Original posts and local files are not deleted.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => {
        setBusy(true);
        void api.removeSource(source.id).then(() => setSelected(null))
          .catch((error) => Alert.alert('Could not remove search', String(error.message ?? error))).finally(() => setBusy(false));
      } },
    ]);
  }
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <View style={styles.row}><Text style={[styles.title, { color: colors.foreground }]}>Online media sources</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close online sources" disabled={busy} onPress={onClose} style={styles.icon}>
          <Feather name="x" size={22} color={colors.foreground} />
        </Pressable>
      </View>
      <FlatList data={editing ? [] : result?.items ?? []} keyExtractor={(item) => item.id}
        initialNumToRender={6} windowSize={3} style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        renderScrollComponent={(props) => <KeyboardAwareScrollView {...props} />}
        ListHeaderComponent={<View style={{ gap: 12 }}>
              {label('Create separate booru/tag or subreddit searches, then select a source for each slideshow. Nothing is bulk-downloaded. Online videos play in the four native video quadrants.', true)}
          {api.storageError ? <>{label(api.storageError)}{button('Retry saved searches', () => void api.retryStorage())}</> : null}
          <RedditAccountSettings />
              <Rule34AccountSettings />
          {!editing && <>
            {button('Add search', () => setEditing(draft()), !api.loaded || !!api.storageError)}
            <FlatList horizontal data={api.sources} keyExtractor={(item) => item.id} initialNumToRender={8}
              renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => setSelected(item.id)}
                accessibilityState={{ selected: item.id === source?.id }}
                style={[styles.button, { marginRight: 8, borderColor: item.id === source?.id ? colors.primary : colors.border }]}>
                <Text style={{ color: colors.foreground }}>{item.name}</Text>
              </Pressable>} />
            {source && <>
              {label(source.kind === 'booru' ? `${source.board}\nTags: ${source.tags || '(all)'}${source.safeOnly ? ' · safe-rated only' : ''}` :
                source.kind === 'reddit' ? `r/${source.subreddits} · ${source.sort}${source.safeOnly ? ' · safe posts only' : ''}` :
                  `${source.kind === 'rule34' ? 'Rule34.xxx' : 'e621.net'}\nTags: ${source.tags || '(all)'}${source.safeOnly ? ' · safe-rated only' : ''}`, true)}
              <View style={styles.wrap}>
                {button('Edit', () => setEditing({ ...source }))}
                {button('Remove', remove)}
                {button(result?.loaded ? 'Refresh' : 'Load results', () => void api.refresh(source.id), result?.loading)}
                {button('Load more', () => void api.refresh(source.id, true), !result?.hasMore || result.loading)}
              </View>
              {result?.loading && <ActivityIndicator color={colors.primary} />}
              {!!result?.error && label(result.error)}
              {!!result?.notice && label(result.notice)}
              {result?.loaded && label(`${result.images.length} images / GIFs · ${videos.length} videos. Unsupported links and filtered posts are skipped.`, true)}
              {videos.length > 0 && button('Play source videos', () => onPlayVideos(videos, source.name))}
              {result?.loaded && !result.items.length && label('No supported media on this page. Try different tags, another page, or check the source access settings.', true)}
            </>}
          </>}
          {editing && <>
            {input('Search name', 'name', 'A name for this independent search')}
            <View style={styles.wrap}>
              {button(`${editing.kind === 'booru' ? '✓ ' : ''}booru.org board`, () => setEditing({ ...editing, kind: 'booru' }))}
              {button(`${editing.kind === 'rule34' ? '✓ ' : ''}Rule34.xxx`, () => setEditing({ ...editing, kind: 'rule34' }))}
              {button(`${editing.kind === 'e621' ? '✓ ' : ''}e621.net`, () => setEditing({ ...editing, kind: 'e621' }))}
              {button(`${editing.kind === 'reddit' ? '✓ ' : ''}Reddit`, () => setEditing({ ...editing, kind: 'reddit' }))}
            </View>
            {editing.kind === 'booru' ? <>
              {input('Board address', 'board', 'https://your-board.booru.org')}
              {input('Tags', 'tags', 'landscape blue_sky -rain')}
              {label('Use the board’s tag syntax: spaces combine tags, underscores join words, and -tag excludes a tag. The board must expose its public DAPI feed; access restrictions are not bypassed.', true)}
            </> : editing.kind === 'reddit' ? <>
              {input('Subreddits', 'subreddits', 'EarthPorn + aww')}
              <View style={styles.wrap}>{(['hot', 'new', 'top'] as const).map((sort) =>
                <React.Fragment key={sort}>{button(`${editing.sort === sort ? '✓ ' : ''}${sort === 'top' ? 'Top this week' : sort}`,
                  () => setEditing({ ...editing, sort }))}</React.Fragment>)}</View>
              {label('Reddit sources require the linked account above and Reddit’s approval. GIF files go to slideshows; video-based animations and videos go to the video player.', true)}
            </> : <>
              {input('Tags', 'tags', 'fox landscape -animated')}
              {label(editing.kind === 'e621'
                ? 'Uses the e621 JSON API with paced requests. Safe-rated posts are selected by default; source ratings come from the site.'
                : 'Uses the Rule34 JSON API. Connect with your Rule34 numeric user ID and API key above; credentials are stored only in Android secure storage.', true)}
            </>}
            <View style={styles.row}>{label('Only safe-rated posts')}
              <SettingSwitch label="Only safe-rated posts" value={editing.safeOnly} disabled={busy}
                onValueChange={(safeOnly) => setEditing({ ...editing, safeOnly })} />
            </View>
            <View style={styles.wrap}>{button('Save and search', () => void save())}{button('Cancel editing', () => setEditing(null))}</View>
          </>}
        </View>}
        renderItem={({ item }) => <View style={[styles.result, { borderColor: colors.border }]}>
          <Image source={{ uri: item.preview ?? (item.kind === 'image' ? item.uri : undefined) }} style={{ width: 84, height: 62 }}
            contentFit="contain" autoplay={false} allowDownscaling cachePolicy="none" recyclingKey={item.id} />
          <View style={{ flex: 1, gap: 3 }}>{label(item.kind === 'video' ? 'Video / animated video' : 'Image / GIF')}
            <Text numberOfLines={2} style={{ color: colors.mutedForeground, fontSize: 12 }}>{item.name}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Open original post" style={styles.icon}
            onPress={() => { void Linking.openURL(item.postUrl).catch(() => Alert.alert('Could not open post')); }}>
            <Feather name="external-link" size={19} color={colors.primary} />
          </Pressable>
        </View>} />
    </View></View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.85)' },
  sheet: { width: '100%', maxWidth: 820, maxHeight: '92%', padding: 20, gap: 12, borderWidth: 1, borderRadius: 20 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 19, fontWeight: '700', flex: 1 },
  button: { borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 44, justifyContent: 'center' },
  input: { padding: 12, borderWidth: 1, borderRadius: 10, minHeight: 46 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  result: { paddingVertical: 10, gap: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
});
