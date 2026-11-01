import { Feather } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useSlideshow } from '@/hooks/useSlideshow';
import { pickMediaFiles } from '@/lib/media-picker';
import { isSlideshowImage, type Slideshow } from '@/lib/slideshow';
import SettingSwitch from '../SettingSwitch';

export default function SlideshowPanel({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const colors = useColors();
  const { slideshow: s, setSlideshow } = useSlideshow();
  const [picking, setPicking] = useState(false);
  const update = (changes: Partial<Slideshow>) => setSlideshow((old) => ({ ...old, ...changes }));
  const text = (value: string, small = false) => <Text style={{
    color: small ? colors.mutedForeground : colors.foreground, fontSize: small ? 12 : 14,
  }}>{value}</Text>;
  async function add() {
    if (picking) return;
    setPicking(true);
    try {
      const result = await pickMediaFiles();
      if (result.canceled || !result.assets) return;
      const selected = result.assets.filter(isSlideshowImage);
      if (!selected.length) {
        Alert.alert('No images selected', 'Choose images or animated GIFs. The video and background-audio pools stay separate.');
        return;
      }
      setSlideshow((old) => {
        const known = new Set(old.pool.map((item) => item.uri));
        const additions = selected.filter((item) => {
          if (known.has(item.uri)) return false;
          known.add(item.uri); return true;
        }).map((item) => ({ id: item.uri, uri: item.uri, name: item.name }));
        return { ...old, pool: [...old.pool, ...additions] };
      });
      if (selected.length < result.assets.length) Alert.alert('Some files were not added', 'Only images and GIFs were added to this pool.');
    } catch (error) {
      Alert.alert('Could not add images', error instanceof Error ? error.message : 'Please select the files again.');
    } finally { setPicking(false); }
  }
  const slider = (label: string, key: 'scale' | 'opacity' | 'x' | 'y' | 'seconds' | 'speed',
    min: number, max: number, step: number, value: number, suffix: string) => (
    <View style={styles.control} key={key}>
      <View style={styles.row}>{text(label)}{text(`${Math.round(value)}${suffix}`)}</View>
      <Slider value={value} minimumValue={min} maximumValue={max} step={step} disabled={picking}
        accessibilityLabel={label} accessibilityValue={{ min, max, now: value }}
        minimumTrackTintColor={colors.primary} maximumTrackTintColor={colors.muted} thumbTintColor={colors.primary}
        onValueChange={(next) => update({ [key]: key === 'opacity' ? next / 100 : next })} />
    </View>
  );
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!picking) onClose(); }}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={styles.row}>
            <Text style={[styles.title, { color: colors.foreground }]}>Image / GIF slideshow</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close slideshow settings" disabled={picking} onPress={onClose} style={styles.icon}>
              <Feather name="x" size={22} color={colors.foreground} />
            </Pressable>
          </View>
          <FlatList data={s.pool} keyExtractor={(item) => item.id} initialNumToRender={6} windowSize={3}
            style={styles.list} contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator
            ListHeaderComponent={<View style={styles.header}>
              {text('A click-through overlay on the four videos. GIFs animate. Include this pool and its controls with Save session.', true)}
              <View style={styles.row}>
                {text('Show slideshow')}
                <SettingSwitch label="Show image slideshow" value={s.enabled} disabled={picking}
                  onValueChange={(enabled) => update({ enabled })} />
              </View>
              <Pressable accessibilityRole="button" disabled={picking} onPress={() => void add()}
                style={[styles.button, { backgroundColor: colors.primary }]}>
                <Text style={{ color: colors.primaryForeground }}>{picking ? 'Opening files…' : 'Add images / GIFs'}</Text>
              </Pressable>
              {slider('Scale', 'scale', 10, 100, 1, s.scale, '%')}
              {slider('Opacity', 'opacity', 0, 100, 1, s.opacity * 100, '%')}
              {slider('Horizontal position', 'x', 0, 100, 1, s.x, '%')}
              {slider('Vertical position', 'y', 0, 100, 1, s.y, '%')}
              {text('Position: 0% is left/top; 100% is right/bottom. The image always stays inside the screen.', true)}
              {slider('Time per image', 'seconds', 1, 60, 1, s.seconds, ' seconds')}
              <View style={styles.row}>
                {text('DVD-style bounce')}
                <SettingSwitch label="DVD-style bounce" value={s.bounce} disabled={picking}
                  onValueChange={(bounce) => update({ bounce })} />
              </View>
              {s.bounce && slider('Bounce speed', 'speed', 5, 80, 1, s.speed, ' dp/s')}
              <View style={styles.row}>
                {text(`${s.pool.length} images / GIFs`)}
                <Pressable accessibilityRole="button" disabled={picking || !s.pool.length} onPress={() =>
                  update({ index: (s.index + 1) % Math.max(1, s.pool.length) })} style={styles.icon}>
                  <Feather name="skip-forward" size={20} color={colors.primary} />
                </Pressable>
              </View>
              {text('Removing an item only removes it from this pool, never from your device.', true)}
            </View>}
            ListEmptyComponent={text('No images yet. Add files above, then enable Show slideshow.', true)}
            renderItem={({ item }) => (
              <View style={[styles.fileRow, { borderBottomColor: colors.border }]}>
                <Image source={{ uri: item.uri }} style={styles.thumb} contentFit="contain"
                  autoplay={false} allowDownscaling cachePolicy="none" recyclingKey={item.uri} />
                <Text numberOfLines={2} style={{ flex: 1, color: colors.foreground, fontSize: 13 }}>{item.name}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${item.name} from image pool`}
                  disabled={picking} style={styles.icon} onPress={() => setSlideshow((old) => {
                    const current = old.pool[old.index]?.uri;
                    const pool = old.pool.filter((asset) => asset.uri !== item.uri);
                    return { ...old, pool, index: Math.max(0, pool.findIndex((asset) => asset.uri === current)) };
                  })}>
                  <Feather name="trash-2" size={18} color={colors.destructive} />
                </Pressable>
              </View>
            )} />
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.8)' },
  sheet: { width: '100%', maxWidth: 700, maxHeight: '92%', borderWidth: 1, borderRadius: 20, padding: 20, gap: 12 },
  title: { fontSize: 19, fontWeight: '700', flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  header: { gap: 15, paddingBottom: 16 },
  control: { gap: 4 },
  list: { flexGrow: 0, minHeight: 0, flexShrink: 1 },
  button: { borderRadius: 10, padding: 13, alignItems: 'center' },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  fileRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  thumb: { width: 70, height: 52 },
});
