import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { CombatControlScheme } from '@/lib/input-controls';
import { COMBAT_HIT_SLOP, combatPress } from '@/components/quest/press';
import {
  boundsFor, bubblePlacement, clampToBounds, directedWaypoint, enemySizeFor, nextWaypoint, spawnPoint,
  type MotionBounds, type MotionDirective,
} from '@/lib/enemy-motion';
import type { EnemySpeechEvent } from '@/lib/combat-ai';

type SpriteAnchor = { x: number; y: number; size: number; final: boolean };

/** Last known sprite anchors. Listeners fire only when a defeated sprite's stop position settles. */
export class SpritePositions {
  private anchors = new Map<string, SpriteAnchor>();
  private listeners = new Set<() => void>();
  get(id: string) { return this.anchors.get(id); }
  set(id: string, anchor: SpriteAnchor) {
    const previous = this.anchors.get(id);
    if (previous?.final) return;
    this.anchors.set(id, anchor);
    if (anchor.final) this.listeners.forEach((listener) => listener());
  }
  clear() { this.anchors.clear(); }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
}

const SETTLE_FALLBACK_MS = 450;

export type FieldEnemy = {
  id: string;
  uri: string;
  name: string;
  hp: number;
  maxHp: number;
  bpm: number | null;
  vanished?: boolean;
};

const RGB = ['#ff4fd8', '#46e0ff', '#b8ff5a'];
const EASINGS = [
  Easing.inOut(Easing.quad),
  Easing.inOut(Easing.cubic),
  Easing.out(Easing.cubic),
  Easing.inOut(Easing.sin),
];
const IMAGE_TIMEOUT_MS = 15_000;

type HitBurst = { key: number; damage: number };

function Burst({ damage, size, onDone }: { damage: number; size: number; onDone: () => void }) {
  const progress = useRef(new Animated.Value(0)).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1, duration: 620, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    });
    animation.start(() => onDoneRef.current());
    return () => animation.stop();
  }, [progress]);
  const radius = size * 0.62;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.burstCenter]}>
      {Array.from({ length: 10 }, (_, index) => {
        const angle = (index / 10) * Math.PI * 2 + 0.3;
        return (
          <Animated.View key={index} style={[styles.spark, {
            backgroundColor: RGB[index % 3],
            opacity: progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.9, 0] }),
            transform: [
              { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * radius] }) },
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * radius] }) },
              { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1.3, 0.4] }) },
            ],
          }]} />
        );
      })}
      <Animated.Text style={[styles.damage, {
        fontSize: Math.max(26, size * 0.16),
        opacity: progress.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.45] }) },
          { scale: progress.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.6, 1.25, 1] }) },
        ],
      }]}>-{damage}</Animated.Text>
    </View>
  );
}

function SpeechBubble({ text, kind, maxWidth }: { text: string; kind: 'taunt' | 'defeat'; maxWidth: number }) {
  const colors = useColors();
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 6, tension: 140, useNativeDriver: true }).start();
  }, [pop]);
  const defeat = kind === 'defeat';
  return (
    <Animated.View pointerEvents="none" style={[styles.bubble, {
      maxWidth,
      backgroundColor: defeat ? colors.background : colors.card,
      borderColor: defeat ? RGB[0] : colors.primary,
      opacity: pop,
      transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
    }]}>
      <Text style={[styles.bubbleKicker, { color: defeat ? RGB[0] : RGB[1] }]}>{defeat ? 'LAST WORDS' : 'TAUNT'}</Text>
      <Text style={[styles.bubbleText, { color: colors.foreground }]}>{text}</Text>
    </Animated.View>
  );
}

/** Death lines float where the enemy fell; survives wave changes and run completion. */
export function SpeechLayer({
  speech, positions, liveIds,
}: { speech: EnemySpeechEvent[]; positions: SpritePositions; liveIds?: ReadonlySet<string> }) {
  const [field, setField] = useState({ width: 0, height: 0 });
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});
  const [, bump] = useState(0);
  useEffect(() => positions.subscribe(() => bump((value) => value + 1)), [positions]);
  const defeats = speech.filter((item) => item.kind === 'defeat');
  // Re-check once the fallback window passes for sprites that never report a stop.
  const pendingKey = defeats.filter((item) => !positions.get(item.enemyId)?.final).map((item) => item.id).join(',');
  useEffect(() => {
    if (!pendingKey) return;
    const timer = setTimeout(() => bump((value) => value + 1), SETTLE_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [pendingKey]);
  const items = defeats.filter((item) => !liveIds?.has(item.enemyId));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={(event) => {
      const { width, height } = event.nativeEvent.layout;
      setField((current) => current.width === width && current.height === height ? current : { width, height });
    }}>
      {field.width > 0 && items.map((item) => {
        const anchor = positions.get(item.enemyId);
        if (!anchor || (!anchor.final && Date.now() - item.createdAt < SETTLE_FALLBACK_MS)) return null;
        const box = measured[item.id] ?? { width: 220, height: 64 };
        const place = bubblePlacement(anchor, anchor.size, box, field);
        return (
          <View key={item.id} pointerEvents="none" style={{ position: 'absolute', left: place.left, top: place.top }}
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              setMeasured((current) => current[item.id]?.width === width && current[item.id]?.height === height
                ? current : { ...current, [item.id]: { width, height } });
            }}>
            <SpeechBubble text={item.text} kind="defeat" maxWidth={Math.min(280, field.width - 16)} />
          </View>
        );
      })}
    </View>
  );
}

/**
 * Taunt follows the sprite's animated position through native-driven interpolation,
 * clamped to the field on every frame without React re-renders. Flips below near the top.
 */
function TauntBubble({
  text, xy, size, width, field,
}: { text: string; xy: Animated.ValueXY; size: number; width: number; field: { width: number; height: number } }) {
  const [height, setHeight] = useState(70);
  const margin = 8;
  const offsetX = size / 2 - width / 2;
  const minLeft = margin;
  const maxLeft = Math.max(minLeft, field.width - width - margin);
  const left = xy.x.interpolate({
    inputRange: [minLeft - offsetX, maxLeft - offsetX + 0.001], outputRange: [minLeft, maxLeft + 0.001], extrapolate: 'clamp',
  });
  const flipAt = height + 12 + margin;
  const far = 100_000;
  const rawTop = xy.y.interpolate({
    inputRange: [-far, flipAt - 0.01, flipAt, far],
    outputRange: [-far + size + 16, flipAt - 0.01 + size + 16, flipAt - height - 12, far - height - 12],
  });
  const maxTop = Math.max(margin, field.height - height - margin);
  const top = rawTop.interpolate({ inputRange: [margin, maxTop + 0.001], outputRange: [margin, maxTop + 0.001], extrapolate: 'clamp' });
  return (
    <Animated.View pointerEvents="none" style={[styles.tauntDock, { width, transform: [{ translateX: left }, { translateY: top }] }]}
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.height);
        if (next > 0 && Math.abs(next - height) > 1) setHeight(next);
      }}>
      <SpeechBubble text={text} kind="taunt" maxWidth={width} />
    </Animated.View>
  );
}

function EnemySprite({
  enemy, size, bounds, index, count, paused, calm, controlScheme, onHit, onImageFailed,
  directive, taunt, positions, fieldWidth, fieldHeight,
}: {
  directive?: MotionDirective;
  taunt?: string;
  positions: SpritePositions;
  fieldWidth: number;
  fieldHeight: number;
  enemy: FieldEnemy;
  size: number;
  bounds: MotionBounds;
  index: number;
  count: number;
  paused: boolean;
  calm: boolean;
  controlScheme: CombatControlScheme;
  onHit: (id: string) => void;
  onImageFailed: (id: string, uri: string) => void;
}) {
  const colors = useColors();
  const start = useRef(spawnPoint(bounds, index, count)).current;
  const position = useRef({ ...start });
  const xy = useRef(new Animated.ValueXY(start)).current;
  const rotation = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const punch = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const death = useRef(new Animated.Value(0)).current;
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const [loaded, setLoaded] = useState(false);
  const [bursts, setBursts] = useState<HitBurst[]>([]);
  const burstKey = useRef(0);
  const lastHp = useRef(enemy.hp);
  const dead = enemy.hp <= 0;
  const failedRef = useRef(onImageFailed);
  failedRef.current = onImageFailed;
  const directiveRef = useRef(directive);
  directiveRef.current = directive;
  const stepCount = useRef(0);
  const deadRef = useRef(dead);
  deadRef.current = dead;
  const report = (point: { x: number; y: number }, final = false) =>
    positions.set(enemy.id, { x: point.x, y: point.y, size, final });
  const reportRef = useRef(report);
  reportRef.current = report;
  useEffect(() => { reportRef.current(position.current); }, [size]);
  // Unmount (wave change) also freezes the anchor where the sprite actually was.
  useEffect(() => () => {
    xy.stopAnimation((value) => reportRef.current(value as unknown as { x: number; y: number }, true));
  }, [xy]);

  // Snap back inside if the field resizes (rotation, single/quad change).
  useEffect(() => {
    const clamped = clampToBounds(position.current, bounds);
    if (clamped.x !== position.current.x || clamped.y !== position.current.y) {
      position.current = clamped;
      xy.setValue(clamped);
    }
  }, [bounds, xy]);

  // Hidden until loaded; give up and request a replacement if it never arrives.
  useEffect(() => {
    if (loaded) return;
    const timer = setTimeout(() => failedRef.current(enemy.id, enemy.uri), IMAGE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [enemy.id, enemy.uri, loaded]);

  // Independent wandering path.
  useEffect(() => {
    if (paused || dead) return;
    let cancelled = false;
    let hold: ReturnType<typeof setTimeout> | null = null;
    let animation: Animated.CompositeAnimation | null = null;
    const step = () => {
      if (cancelled) return;
      const plan = directiveRef.current;
      stepCount.current += 1;
      // Model directive shapes the path when present; otherwise labeled random fallback.
      const waypoint = plan
        ? directedWaypoint(position.current, boundsRef.current, calm, plan, stepCount.current)
        : nextWaypoint(position.current, boundsRef.current, calm);
      animation = Animated.parallel([
        Animated.timing(xy, {
          toValue: { x: waypoint.x, y: waypoint.y }, duration: waypoint.duration,
          easing: EASINGS[waypoint.curve], useNativeDriver: true,
        }),
        Animated.timing(rotation, {
          toValue: waypoint.rotate, duration: waypoint.duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true,
        }),
      ]);
      animation.start(({ finished }) => {
        if (!finished || cancelled) return;
        position.current = { x: waypoint.x, y: waypoint.y };
        reportRef.current(position.current);
        if (waypoint.hold) hold = setTimeout(step, waypoint.hold);
        else step();
      });
    };
    step();
    return () => {
      cancelled = true;
      if (hold) clearTimeout(hold);
      animation?.stop();
      xy.stopAnimation((value) => {
        position.current = value as unknown as { x: number; y: number };
        reportRef.current(position.current, deadRef.current);
      });
    };
  }, [calm, dead, paused, rotation, xy]);

  // BPM pulse (or a gentle breath when no tempo is known).
  useEffect(() => {
    if (paused || dead) {
      pulse.setValue(0);
      return;
    }
    const beat = enemy.bpm ? 60_000 / enemy.bpm : 1_800;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: Math.max(70, beat * (enemy.bpm ? 0.2 : 0.5)), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: Math.max(90, beat * (enemy.bpm ? 0.8 : 0.5)), useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [dead, enemy.bpm, paused, pulse]);

  // Hit feedback whenever HP drops (taps, skills, spells).
  useEffect(() => {
    const damage = lastHp.current - enemy.hp;
    lastHp.current = enemy.hp;
    if (damage <= 0 || enemy.vanished) return;
    burstKey.current += 1;
    const key = burstKey.current;
    setBursts((current) => [...current.slice(-3), { key, damage }]);
    punch.setValue(1);
    flash.setValue(1);
    Animated.parallel([
      Animated.spring(punch, { toValue: 0, friction: 4, tension: 160, useNativeDriver: true }),
      Animated.timing(flash, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start();
    if (enemy.hp <= 0) {
      Animated.timing(death, { toValue: 1, duration: 420, easing: Easing.in(Easing.back(1.6)), useNativeDriver: true }).start();
    }
  }, [death, enemy.hp, enemy.vanished, flash, punch]);

  if (enemy.vanished) return null;
  const tauntWidth = Math.min(260, Math.max(120, fieldWidth - 16));
  const pulseScale = calm ? 0.025 : 0.06;
  const activate = () => { if (!dead && loaded && !paused) onHit(enemy.id); };

  return (
    <>
    <Animated.View
      pointerEvents={loaded && !dead ? 'box-none' : 'none'}
      style={[styles.sprite, {
        width: size, height: size,
        opacity: loaded ? death.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) : 0,
        transform: [
          { translateX: xy.x },
          { translateY: xy.y },
          { rotate: rotation.interpolate({ inputRange: [-30, 30], outputRange: ['-30deg', '30deg'] }) },
          { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + pulseScale] }) },
          { scale: death.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) },
        ],
      }]}
    >
      <Animated.View style={[styles.spriteInner, {
        transform: [
          { scale: punch.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86] }) },
          { rotate: punch.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-5deg'] }) },
        ],
      }]}>
        <View pointerEvents="none" style={[styles.shadowFrame, { backgroundColor: colors.primary }]} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Strike ${enemy.name}, ${enemy.hp} of ${enemy.maxHp} health`}
          disabled={dead || !loaded || paused}
          hitSlop={COMBAT_HIT_SLOP}
          {...combatPress(controlScheme, activate)}
          style={[styles.frame, { borderColor: colors.primary, backgroundColor: colors.card }]}
        >
          <Image
            source={{ uri: enemy.uri }}
            contentFit="cover"
            transition={0}
            style={styles.image}
            onLoad={() => setLoaded(true)}
            onError={() => onImageFailed(enemy.id, enemy.uri)}
          />
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, { opacity: flash }]} />
          {RGB.concat(colors.primary).map((color, corner) => (
            <View key={corner} pointerEvents="none" style={[styles.corner, {
              backgroundColor: color,
              top: corner < 2 ? 3 : undefined, bottom: corner >= 2 ? 3 : undefined,
              left: corner % 2 === 0 ? 3 : undefined, right: corner % 2 === 1 ? 3 : undefined,
            }]} />
          ))}
        </Pressable>
        <View pointerEvents="none" style={[styles.hpBar, { backgroundColor: colors.background, borderColor: colors.primary }]}>
          {Array.from({ length: enemy.maxHp }, (_, segment) => (
            <View key={segment} style={[styles.hpSegment, {
              backgroundColor: segment < enemy.hp ? RGB[segment % 3] : colors.muted,
            }]} />
          ))}
        </View>
      </Animated.View>
      {bursts.map((burst) => (
        <Burst key={burst.key} damage={burst.damage} size={size}
          onDone={() => setBursts((current) => current.filter((item) => item.key !== burst.key))} />
      ))}
    </Animated.View>
    {!!taunt && !dead && loaded && (
      <TauntBubble text={taunt} xy={xy} size={size} width={tauntWidth} field={{ width: fieldWidth, height: fieldHeight }} />
    )}
    </>
  );
}

export type CombatHudProps = {
  wave: number;
  waves: number;
  combo: number;
  bpm: number | null;
  message: string;
  skillName: string;
  spellName: string;
  skillReady: boolean;
  spellReady: boolean;
  paused: boolean;
  videoPaused: boolean;
  canOpenBoard: boolean;
  directorLabel?: string;
  directorMode?: 'ai' | 'thinking' | 'fallback';
  huntLabel?: string;
  onSkill: () => void;
  onSpell: () => void;
  onTogglePause: () => void;
  onOpenBoard: () => void;
  onLeave: () => void;
};

function HudButton({
  icon, label, onPress, disabled, primary,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPressIn={onPress} hitSlop={6}
      style={({ pressed }) => [styles.hudButton, {
        backgroundColor: primary ? colors.primary : colors.secondary,
        borderColor: primary ? colors.primary : colors.border,
        opacity: disabled ? 0.42 : 1,
        transform: [{ scale: pressed ? 0.94 : 1 }],
      }]}>
      <Feather name={icon} size={16} color={primary ? colors.primaryForeground : colors.primary} />
      <Text numberOfLines={1} style={[styles.hudButtonText, { color: primary ? colors.primaryForeground : colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

function DirectorDot({ mode }: { mode?: 'ai' | 'thinking' | 'fallback' }) {
  const colors = useColors();
  const color = mode === 'ai' ? RGB[2] : mode === 'thinking' ? RGB[1] : colors.mutedForeground;
  return <View style={[styles.directorDot, { backgroundColor: color }]} />;
}

function CombatHud(props: CombatHudProps & { collapsed: boolean; onToggleCollapsed: () => void }) {
  const colors = useColors();
  if (props.collapsed) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Show combat controls" onPress={props.onToggleCollapsed}
        style={[styles.hudPill, { backgroundColor: colors.card, borderColor: colors.primary }]}>
        <Feather name="chevrons-up" size={15} color={colors.primary} />
        <Text style={[styles.hudPillText, { color: colors.foreground }]}>
          WAVE {props.wave}/{props.waves} · x{props.combo}
        </Text>
        {!!props.directorLabel && <DirectorDot mode={props.directorMode} />}
      </Pressable>
    );
  }
  const status = props.videoPaused ? 'Video paused, enemies hold still.' : props.paused ? 'Combat paused.' : props.message;
  return (
    <View style={[styles.hud, { backgroundColor: colors.card, borderColor: colors.primary }]}>
      <View style={styles.hudTop}>
        <View style={styles.hudPips}>
          {Array.from({ length: props.waves }, (_, wave) => (
            <View key={wave} style={[styles.hudPip, {
              backgroundColor: wave < props.wave ? RGB[wave % 3] : colors.muted,
            }]} />
          ))}
        </View>
        <Text numberOfLines={1} style={[styles.hudTitle, { color: colors.foreground }]}>
          WAVE {props.wave}/{props.waves}
          <Text style={{ color: colors.primary }}>  x{props.combo}</Text>
          {props.bpm ? <Text style={{ color: colors.mutedForeground }}>  {props.bpm} BPM</Text> : null}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Hide combat controls" onPress={props.onToggleCollapsed}
          hitSlop={8} style={styles.hudIcon}>
          <Feather name="chevrons-down" size={17} color={colors.mutedForeground} />
        </Pressable>
      </View>
      {!!status && <Text numberOfLines={1} style={[styles.hudMessage, { color: colors.mutedForeground }]}>{status}</Text>}
      {!!props.directorLabel && (
        <View style={styles.directorRow}>
          <DirectorDot mode={props.directorMode} />
          <Text numberOfLines={1} style={[styles.directorText, { color: colors.foreground }]}>{props.directorLabel}</Text>
          {!!props.huntLabel && (
            <Text numberOfLines={1} style={[styles.directorText, styles.huntText, { color: colors.mutedForeground }]}>
              {props.huntLabel}
            </Text>
          )}
        </View>
      )}
      <View style={styles.hudRow}>
        <HudButton icon="crosshair" label={props.skillReady ? props.skillName : 'Resting'} onPress={props.onSkill}
          disabled={!props.skillReady || props.paused} primary />
        <HudButton icon="zap" label={props.spellReady ? props.spellName : 'Resting'} onPress={props.onSpell}
          disabled={!props.spellReady || props.paused} primary />
        <HudButton icon={props.paused && !props.videoPaused ? 'play' : 'pause'}
          label={props.paused && !props.videoPaused ? 'Resume' : 'Pause'} onPress={props.onTogglePause}
          disabled={props.videoPaused} />
        {props.canOpenBoard && <HudButton icon="book-open" label="Board" onPress={props.onOpenBoard} />}
        <HudButton icon="log-out" label="Leave" onPress={props.onLeave} />
      </View>
    </View>
  );
}

export default function CombatField({
  enemies, paused, calm, controlScheme, onHit, onImageFailed, banner, hud, directives, speech, positions,
}: {
  directives: Record<string, MotionDirective>;
  speech: EnemySpeechEvent[];
  positions: SpritePositions;
  enemies: FieldEnemy[];
  paused: boolean;
  calm: boolean;
  controlScheme: CombatControlScheme;
  onHit: (id: string) => void;
  onImageFailed: (id: string, uri: string) => void;
  banner: string;
  hud: CombatHudProps;
}) {
  const colors = useColors();
  const [field, setField] = useState({ width: 0, height: 0 });
  const [collapsed, setCollapsed] = useState(false);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setField((current) => current.width === width && current.height === height ? current : { width, height });
  };
  const size = enemySizeFor(field.width, field.height, enemies.length);
  const bounds = boundsFor(
    field.width, field.height, size + 18, collapsed ? 56 : 132,
    Math.ceil(size * 0.12) + 10,
  );
  const living = enemies.some((enemy) => enemy.hp > 0);
  const liveIds = new Set(enemies.filter((enemy) => enemy.hp > 0).map((enemy) => enemy.id));
  const taunts = new Map(speech.filter((item) => item.kind === 'taunt').map((item) => [item.enemyId, item.text]));

  return (
    <View pointerEvents="box-none" style={styles.field} onLayout={onLayout}>
      {field.width > 0 && enemies.map((enemy, index) => (
        <EnemySprite key={enemy.id} enemy={enemy} size={size} bounds={bounds} index={index} count={enemies.length}
          paused={paused} calm={calm} controlScheme={controlScheme} onHit={onHit} onImageFailed={onImageFailed}
          directive={directives[enemy.id]} taunt={taunts.get(enemy.id)} positions={positions} fieldWidth={field.width} fieldHeight={field.height} />
      ))}
      <SpeechLayer speech={speech} positions={positions} liveIds={liveIds} />
      {!living && !!banner && (
        <View pointerEvents="none" style={styles.bannerWrap}>
          <View style={[styles.banner, { backgroundColor: colors.card, borderColor: colors.primary }]}>
            <View style={styles.bannerStripe}>
              {RGB.map((color) => <View key={color} style={[styles.bannerStripeBit, { backgroundColor: color }]} />)}
            </View>
            <Text style={[styles.bannerText, { color: colors.foreground }]}>{banner}</Text>
          </View>
        </View>
      )}
      <View pointerEvents="box-none" style={styles.hudDock}>
        <CombatHud {...hud} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((value) => !value)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { ...StyleSheet.absoluteFill, zIndex: 90, elevation: 90 },
  sprite: { position: 'absolute', left: 0, top: 0 },
  spriteInner: { flex: 1 },
  shadowFrame: { position: 'absolute', left: 7, top: 7, right: -7, bottom: -7, borderRadius: 10, opacity: 0.55 },
  frame: { flex: 1, borderWidth: 4, borderRadius: 10, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  flash: { backgroundColor: 'rgba(255,240,255,0.75)' },
  corner: { position: 'absolute', width: 9, height: 9 },
  hpBar: { position: 'absolute', left: 10, right: 10, bottom: -9, height: 14, borderWidth: 2, borderRadius: 3, padding: 2, flexDirection: 'row', gap: 2 },
  hpSegment: { flex: 1, borderRadius: 1 },
  burstCenter: { alignItems: 'center', justifyContent: 'center' },
  spark: { position: 'absolute', width: 12, height: 12, borderRadius: 2 },
  damage: { position: 'absolute', fontWeight: '900', color: '#fff6ff', textShadowColor: '#7a2cff', textShadowOffset: { width: 3, height: 3 }, textShadowRadius: 0 },
  bannerWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 24 },
  banner: { maxWidth: 520, borderWidth: 3, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 16, gap: 10, alignItems: 'center' },
  bannerStripe: { flexDirection: 'row', gap: 4 },
  bannerStripeBit: { width: 26, height: 5, borderRadius: 1 },
  bannerText: { fontSize: 17, fontWeight: '900', textAlign: 'center', letterSpacing: 0.4 },
  hudDock: { position: 'absolute', left: 0, right: 0, bottom: 10, alignItems: 'center' },
  hud: { maxWidth: 720, marginHorizontal: 10, borderWidth: 2, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, gap: 7 },
  hudTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hudPips: { flexDirection: 'row', gap: 3 },
  hudPip: { width: 14, height: 8, borderRadius: 2 },
  hudTitle: { flex: 1, fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  hudIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  hudMessage: { fontSize: 11 },
  hudRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  hudButton: { minHeight: 42, maxWidth: 190, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  hudButtonText: { fontSize: 11, fontWeight: '800', flexShrink: 1 },
  hudPill: { minHeight: 38, borderWidth: 2, borderRadius: 19, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7 },
  bubble: { borderWidth: 2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, gap: 2 },
  bubbleKicker: { fontSize: 8, fontWeight: '900', letterSpacing: 1.6 },
  bubbleText: { fontSize: 13, fontWeight: '700', lineHeight: 17 },
  tauntDock: { position: 'absolute', left: 0, top: 0, alignItems: 'center' },
  directorRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  directorDot: { width: 8, height: 8, borderRadius: 1 },
  directorText: { fontSize: 11, fontWeight: '800', flexShrink: 1 },
  huntText: { fontWeight: '600' },
  hudPillText: { fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
});
