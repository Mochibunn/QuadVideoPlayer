import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GameText as Text } from '../GameText';
import PixelIcon from '../PixelIcon';
import GameIcon from '../GameIcon';
import { useColors } from '@/hooks/useColors';

const RUNES = ['sword', 'star', 'shield', 'chest'] as const;
const nextRune = () => Math.floor(Math.random() * RUNES.length);
export default function RuneRush({ visible, onClose, onWin }: {
  visible: boolean; onClose(): void; onWin(): void;
}) {
  const colors = useColors();
  const [sequence, setSequence] = useState<number[]>([]);
  const [round, setRound] = useState(1);
  const [progress, setProgress] = useState(0);
  const [lit, setLit] = useState<number | null>(null);
  const [stage, setStage] = useState<'show' | 'input' | 'won' | 'lost'>('show');
  const awarded = useRef(false);
  const inputCursor = useRef(0);
  const accepting = useRef(false);
  const start = () => {
    awarded.current = false;
    accepting.current = false;
    inputCursor.current = 0;
    setRound(1); setProgress(0); setSequence([nextRune(), nextRune(), nextRune()]); setStage('show');
  };
  useEffect(() => { if (visible) start(); }, [visible]);
  useEffect(() => {
    if (!visible || stage !== 'show' || !sequence.length) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    sequence.forEach((rune, i) => {
      timers.push(setTimeout(() => setLit(rune), 400 + i * 700));
      timers.push(setTimeout(() => setLit(null), 900 + i * 700));
    });
    timers.push(setTimeout(() => {
      inputCursor.current = 0; accepting.current = true; setProgress(0); setStage('input');
    }, 500 + sequence.length * 700));
    return () => timers.forEach(clearTimeout);
  }, [sequence, stage, visible]);
  useEffect(() => {
    if (!visible || stage !== 'input') return;
    const timer = setTimeout(() => { accepting.current = false; setStage('lost'); }, 20_000);
    return () => clearTimeout(timer);
  }, [stage, round, visible]);
  const tap = (rune: number) => {
    if (stage !== 'input' || !accepting.current) return;
    if (sequence[inputCursor.current] !== rune) { accepting.current = false; setStage('lost'); return; }
    const next = inputCursor.current + 1;
    inputCursor.current = next;
    setProgress(next);
    if (next !== sequence.length) return;
    accepting.current = false;
    if (round === 3) {
      setStage('won');
      if (!awarded.current) { awarded.current = true; onWin(); }
    } else {
      setRound((value) => value + 1);
      setSequence((value) => [...value, nextRune(), nextRune()]);
      setStage('show');
    }
  };
  if (!visible) return null;
  return <View pointerEvents="box-none" style={styles.layer}>
    <View style={[styles.panel, { backgroundColor: colors.playbackOverlay, borderColor: colors.primary }]}>
      <View style={styles.heading}>
        <Text style={[styles.title, { color: colors.primary, fontFamily: 'Pixelta' }]}>RUNE RUSH · {round}/3</Text>
        <Pressable accessibilityLabel="Close Rune Rush" onPress={onClose} style={styles.close}>
          <GameIcon name="x" size={20} color={colors.foreground} />
        </Pressable>
      </View>
      <Text accessibilityLiveRegion="polite" style={[styles.copy, { color: colors.foreground }]}>
        {stage === 'show' ? 'Watch the glowing runes…'
          : stage === 'input' ? `Your turn! ${progress}/${sequence.length} · 20 seconds to copy the sequence.`
          : stage === 'won' ? 'Runes mastered! Mini-game victory recorded.'
          : 'The rune fizzled! Try a fresh sequence.'}
      </Text>
      <View style={styles.row}>
        {RUNES.map((rune, i) => <Pressable key={rune} accessibilityRole="button"
          accessibilityLabel={`${rune} rune${lit === i ? ', glowing' : ''}`}
          disabled={stage !== 'input'} onPress={() => tap(i)}
          style={[styles.rune, { backgroundColor: lit === i ? colors.primary : colors.secondary,
            borderColor: lit === i ? colors.foreground : colors.border }]}>
          <PixelIcon name={rune} color={colors.foreground} size={40} />
        </Pressable>)}
      </View>
      {(stage === 'won' || stage === 'lost') && <Pressable onPress={start}
        accessibilityRole="button" style={[styles.again, { borderColor: colors.primary }]}>
        <Text style={{ color: colors.foreground }}>New rune challenge</Text>
      </Pressable>}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 180, justifyContent: 'flex-end', alignItems: 'flex-end', padding: 20 },
  panel: { width: 400, maxWidth: '100%', padding: 14, borderWidth: 3, borderRadius: 2 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, flex: 1 }, close: { padding: 12 },
  copy: { fontSize: 14, lineHeight: 21, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 8 }, rune: { flex: 1, height: 68, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  again: { marginTop: 12, padding: 12, borderWidth: 2, alignItems: 'center' },
});
