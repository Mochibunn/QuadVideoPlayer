import { Feather } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { RELEASE_NOTES } from '@/lib/release-notes';

export default function ReleaseNotesPanel() {
  const colors = useColors();

  return (
    <View style={styles.list}>
      {RELEASE_NOTES.map((release) => (
        <View
          key={release.version}
          style={[styles.card, { backgroundColor: colors.secondary, borderColor: colors.border }]}
        >
          <View style={styles.headingRow}>
            <View style={[styles.iconTile, { backgroundColor: colors.accent }]}>
              <Feather name="star" size={18} color={colors.primary} />
            </View>
            <View style={styles.copy}>
              <Text style={[styles.title, { color: colors.foreground }]}>{release.title}</Text>
              <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                Version {release.version} · {release.date}
              </Text>
            </View>
          </View>
          <Text style={[styles.summary, { color: colors.foreground }]}>{release.summary}</Text>
          <View style={styles.changeList}>
            {release.changes.map((change) => (
              <View key={change} style={styles.changeRow}>
                <View style={[styles.bullet, { backgroundColor: colors.primary }]} />
                <Text style={[styles.changeText, { color: colors.mutedForeground }]}>{change}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 14 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  iconTile: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 4 },
  title: { fontSize: 16, fontWeight: '900' },
  meta: { fontSize: 11 },
  summary: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  changeList: { gap: 10 },
  changeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  bullet: { width: 6, height: 6, marginTop: 6 },
  changeText: { flex: 1, fontSize: 12, lineHeight: 18 },
});
