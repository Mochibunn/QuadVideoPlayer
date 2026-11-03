import { Feather, FontAwesome } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { GameText as Text } from '@/components/GameText';
import { useColors } from '@/hooks/useColors';
import {
  getSamsungHealthBridge,
  isHeartRateFresh,
  type BluetoothPeer,
  type HeartRateBridgeState,
  type SamsungHealthBridgeNative,
} from '@/lib/heart-rate-bridge';

const EMPTY_STATE: HeartRateBridgeState = {
  bpm: null,
  receivedAtMs: null,
  active: false,
  connected: false,
  tabletConnected: false,
  status: 'Not connected',
};

export default function HeartRateSettings() {
  const colors = useColors();
  const [native, setNative] = useState<SamsungHealthBridgeNative | null>(null);
  const [phoneState, setPhoneState] = useState(EMPTY_STATE);
  const [tabletState, setTabletState] = useState(EMPTY_STATE);
  const [pairedDevices, setPairedDevices] = useState<BluetoothPeer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    try {
      setNative(getSamsungHealthBridge());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Android heart-rate bridge is unavailable.');
    }
  }, []);

  const refreshState = useCallback(async () => {
    if (!native) return;
    try {
      const [phone, tablet] = await Promise.all([
        native.getPhoneState(),
        native.getTabletState(),
      ]);
      setPhoneState(phone);
      setTabletState(tablet);
    } catch {
      // Keep the last visible state; explicit actions surface their errors.
    }
  }, [native]);

  useEffect(() => {
    if (!native) return;
    void refreshState();
    const timer = setInterval(() => void refreshState(), 1200);
    return () => clearInterval(timer);
  }, [native, refreshState]);

  const ensureBluetoothPermission = async () => {
    if (Number(Platform.Version) < 31) return true;
    const permission = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
    if (!permission) throw new Error('This Android version does not expose Bluetooth connection permission.');
    const current = await PermissionsAndroid.check(permission);
    if (current) return true;
    const result = await PermissionsAndroid.request(permission, {
      title: 'Connect the phone and tablet',
      message: 'Bluetooth access is used only for the local heart-rate bridge between your paired devices.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    });
    return result === PermissionsAndroid.RESULTS.GRANTED;
  };

  const runAction = async (action: (bridge: SamsungHealthBridgeNative) => Promise<unknown>) => {
    if (!native) return;
    setBusy(true);
    setError('');
    try {
      if (!await ensureBluetoothPermission()) {
        throw new Error('Allow Nearby devices access to use the heart-rate bridge.');
      }
      await action(native);
      await refreshState();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The heart-rate bridge action failed.');
      await refreshState();
    } finally {
      setBusy(false);
    }
  };

  const refreshPairedDevices = () => runAction(async (bridge) => {
    setPairedDevices(await bridge.getBondedDevices());
  });

  const openBluetoothSettings = () => runAction((bridge) => bridge.openBluetoothSettings());
  const startPhoneRelay = () => runAction((bridge) => bridge.startPhoneRelay());
  const stopPhoneRelay = () => runAction((bridge) => bridge.stopPhoneRelay());
  const disconnectTablet = () => runAction((bridge) => bridge.disconnectTablet());

  const connectToDevice = (device: BluetoothPeer) => runAction(async (bridge) => {
    await bridge.connectTablet(device.address);
    await refreshState();
  });

  const primaryState = tabletState.connected ? tabletState : phoneState.active ? phoneState : EMPTY_STATE;
  const readingFresh = isHeartRateFresh(primaryState);
  const liveBpm = readingFresh ? primaryState.bpm : null;
  const pulseScale = useSharedValue(1);
  const heartPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));
  useEffect(() => {
    cancelAnimation(pulseScale);
    pulseScale.value = 1;
    if (!liveBpm || liveBpm <= 0) return;
    const beatMs = Math.min(2_000, Math.max(300, 60_000 / liveBpm));
    pulseScale.value = withRepeat(withSequence(
      withTiming(1.2, { duration: Math.max(70, beatMs * 0.14) }),
      withTiming(1, { duration: Math.max(70, beatMs * 0.16) }),
      withTiming(1.1, { duration: Math.max(70, beatMs * 0.11) }),
      withTiming(1, { duration: Math.max(70, beatMs * 0.59) }),
    ), -1, false);
    return () => cancelAnimation(pulseScale);
  }, [liveBpm, pulseScale]);
  const ageSeconds = primaryState.receivedAtMs
    ? Math.max(0, Math.floor((Date.now() - primaryState.receivedAtMs) / 1000))
    : null;

  if (Platform.OS !== 'android') return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text style={[styles.title, { color: colors.foreground }]}>Live heart rate</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            Watch → phone → tablet over paired Bluetooth. Readings are not saved or used for XP.
          </Text>
        </View>
        <Feather name="activity" size={19} color={colors.primary} />
      </View>

      <View
        accessibilityLabel={readingFresh ? `Live heart rate ${primaryState.bpm} beats per minute` : 'No live heart-rate reading'}
        style={[styles.reading, { borderColor: colors.border, backgroundColor: colors.background }]}
      >
        <View style={styles.heartBpmRow}>
          <Animated.View style={[styles.heartIcon, heartPulseStyle]}>
            <FontAwesome
              name="heart"
              size={25}
              color={readingFresh ? colors.primary : colors.mutedForeground}
            />
          </Animated.View>
          <Text style={[styles.bpm, { color: colors.foreground }]}>
            {readingFresh ? primaryState.bpm : '—'}
            <Text style={[styles.unit, { color: colors.mutedForeground }]}> BPM</Text>
          </Text>
        </View>
        <Text style={[styles.status, { color: readingFresh ? colors.primary : colors.mutedForeground }]}>
          {readingFresh
            ? 'Live'
            : ageSeconds !== null
              ? `Last reading ${ageSeconds}s ago`
              : tabletState.connected
                ? 'Connected · waiting for a watch reading'
                : phoneState.active
                  ? 'Phone relay is waiting for a watch reading'
                  : 'No live reading'}
        </Text>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>On the watch-paired phone</Text>
      <Text style={[styles.description, { color: colors.mutedForeground }]}>
        Install the phone app and watch APK. On the watch, open Goon Quest Link and tap Start; then start this relay on the phone.
      </Text>
      <View style={styles.buttonRow}>
        <ActionButton
          label={phoneState.active ? 'Phone relay running' : 'Start phone relay'}
          icon={phoneState.active ? 'check-circle' : 'radio'}
          disabled={busy || !native || !!phoneState.active}
          onPress={startPhoneRelay}
          colors={colors}
        />
        {phoneState.active && (
          <ActionButton
            label="Stop"
            icon="square"
            disabled={busy || !native}
            onPress={stopPhoneRelay}
            colors={colors}
            secondary
          />
        )}
      </View>
      {phoneState.active && (
        <Text style={[styles.status, { color: colors.mutedForeground }]}>
          {phoneState.status || 'Waiting for a paired tablet'}
        </Text>
      )}

      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Connect this tablet to the phone</Text>
      <Text style={[styles.description, { color: colors.mutedForeground }]}>
        Pair the phone and tablet in Android Bluetooth settings first, then refresh and connect.
      </Text>
      <View style={styles.buttonRow}>
        <ActionButton
          label="Bluetooth settings"
          icon="bluetooth"
          disabled={busy || !native}
          onPress={openBluetoothSettings}
          colors={colors}
          secondary
        />
        <ActionButton
          label="Refresh paired devices"
          icon="refresh-cw"
          disabled={busy || !native}
          onPress={refreshPairedDevices}
          colors={colors}
          secondary
        />
      </View>

      {tabletState.connected ? (
        <View style={styles.buttonRow}>
          <Text style={[styles.status, styles.flex, { color: colors.primary }]}>
            {tabletState.status || 'Connected to the phone'}
          </Text>
          <ActionButton
            label="Disconnect"
            icon="x"
            disabled={busy || !native}
            onPress={disconnectTablet}
            colors={colors}
            secondary
          />
        </View>
      ) : pairedDevices.length > 0 ? (
        <View style={styles.deviceList}>
          {pairedDevices.map((device) => (
            <ActionButton
              key={device.address}
              label={`Connect · ${device.name}`}
              icon="bluetooth"
              disabled={busy || !native}
              onPress={() => connectToDevice(device)}
              colors={colors}
              secondary
            />
          ))}
        </View>
      ) : (
        <Text style={[styles.status, { color: colors.mutedForeground }]}>
          No paired devices listed yet. Pair the two devices, then refresh.
        </Text>
      )}

      {!!error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
      {busy && <ActivityIndicator color={colors.primary} />}
    </View>
  );
}

function ActionButton({
  label,
  icon,
  disabled,
  onPress,
  colors,
  secondary = false,
}: {
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  disabled: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: secondary ? colors.background : colors.accent,
          borderColor: colors.border,
          opacity: disabled ? 0.55 : pressed ? 0.78 : 1,
        },
      ]}
    >
      <Feather name={icon} size={15} color={colors.primary} />
      <Text style={[styles.buttonText, { color: colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 14, gap: 9 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  heading: { flex: 1, gap: 3 },
  title: { fontSize: 17, fontWeight: '700' },
  description: { fontSize: 12, lineHeight: 17 },
  reading: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, alignItems: 'center', gap: 3 },
  heartBpmRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  heartIcon: { width: 34, height: 36, alignItems: 'center', justifyContent: 'center' },
  bpm: { fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'] },
  unit: { fontSize: 13, fontWeight: '600' },
  status: { fontSize: 12, lineHeight: 17 },
  sectionTitle: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  button: { minHeight: 38, paddingHorizontal: 10, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  buttonText: { fontSize: 12, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 3 },
  deviceList: { gap: 7 },
  flex: { flex: 1 },
  error: { fontSize: 12, lineHeight: 17 },
});
