import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { getVideoPreview } from '@/lib/media-picker';

export default function PoolVideoPreview({ uri }: { uri: string }) {
  const colors = useColors();
  const [preview, setPreview] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setPreview(null);
    setFailed(false);
    void getVideoPreview(uri, () => active)
      .then((value) => { if (active) setPreview(value); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [uri]);

  return (
    <View style={[styles.frame, { backgroundColor: colors.card }]} accessible={false}>
      {preview && !failed ? (
        <Image source={{ uri: preview }} style={styles.image} resizeMode="contain" onError={() => setFailed(true)} />
      ) : failed ? (
        <>
          <Feather name="film" size={18} color={colors.mutedForeground} />
          <Text style={[styles.label, { color: colors.mutedForeground }]}>No preview</Text>
        </>
      ) : (
        <ActivityIndicator size="small" color={colors.primary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: 96, height: 60, borderRadius: 6, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 3 },
  image: { width: '100%', height: '100%' },
  label: { fontSize: 10 },
});
