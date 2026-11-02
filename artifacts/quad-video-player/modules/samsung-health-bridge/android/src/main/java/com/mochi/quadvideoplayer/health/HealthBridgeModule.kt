package com.mochi.quadvideoplayer.health

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.content.pm.PackageManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Queues

class HealthBridgeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SamsungHealthBridge")

    AsyncFunction("getBondedDevices") {
      val context = requireContext()
      requireBluetoothConnect(context)
      val adapter = BluetoothAdapter.getDefaultAdapter()
        ?: return@AsyncFunction emptyList<Map<String, String>>()
      adapter.bondedDevices
        .map { device ->
          mapOf(
            "name" to (device.name ?: "Bluetooth device"),
            "address" to device.address,
          )
        }
        .sortedBy { it["name"]?.lowercase() ?: "" }
    }.runOnQueue(Queues.IO)

    AsyncFunction("startPhoneRelay") {
      val context = requireContext()
      requireBluetoothConnect(context)
      val adapter = BluetoothAdapter.getDefaultAdapter()
        ?: throw IllegalStateException("This phone does not support Bluetooth.")
      if (!adapter.isEnabled) {
        throw IllegalStateException("Turn on Bluetooth before starting the phone bridge.")
      }
      val intent = Intent(context, PhoneRelayService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      true
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stopPhoneRelay") {
      TabletBluetoothClient.disconnect()
      requireContext().stopService(Intent(requireContext(), PhoneRelayService::class.java))
      true
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("openBluetoothSettings") {
      val context = requireContext()
      val intent = Intent(Settings.ACTION_BLUETOOTH_SETTINGS)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      true
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("getPhoneState") {
      val packet = HeartRateRuntime.latestPacket
      mapOf(
        "active" to HeartRateRuntime.relayActive,
        "tabletConnected" to HeartRateRuntime.tabletConnected,
        "status" to HeartRateRuntime.relayStatus,
        "bpm" to packet?.bpm,
        "receivedAtMs" to packet?.receivedAtMs,
      )
    }

    AsyncFunction("getTabletState") {
      TabletBluetoothClient.state()
    }

    AsyncFunction("connectTablet") { address: String ->
      val context = requireContext()
      requireBluetoothConnect(context)
      val adapter = BluetoothAdapter.getDefaultAdapter()
        ?: throw IllegalStateException("This tablet does not support Bluetooth.")
      if (!adapter.isEnabled) {
        throw IllegalStateException("Turn on Bluetooth on the tablet and phone.")
      }
      TabletBluetoothClient.connect(adapter, address)
    }.runOnQueue(Queues.IO)

    AsyncFunction("disconnectTablet") {
      TabletBluetoothClient.disconnect()
    }.runOnQueue(Queues.IO)
  }

  private fun requireContext() = appContext.reactContext
    ?: throw IllegalStateException("Quad Video Player is not available.")

  private fun requireBluetoothConnect(context: android.content.Context) {
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
      context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED
    ) {
      throw SecurityException("Allow Nearby devices access to connect the phone and tablet.")
    }
  }
}
