package com.mochi.quadvideoplayer.health

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothServerSocket
import android.bluetooth.BluetoothSocket
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import org.json.JSONObject
import java.io.BufferedWriter
import java.io.IOException
import java.io.OutputStreamWriter
import java.util.UUID

class PhoneRelayService : Service() {
  @Volatile private var running = false
  @Volatile private var serverSocket: BluetoothServerSocket? = null
  @Volatile private var clientSocket: BluetoothSocket? = null
  private var relayThread: Thread? = null

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
    startAsForegroundService()
    HeartRateRuntime.relayActive = true
    HeartRateRuntime.relayStatus = "Waiting for the tablet over Bluetooth"
    running = true
    relayThread = Thread(::serveBluetooth, "qvp-heart-rate-relay").also { it.start() }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY

  @SuppressLint("MissingPermission")
  private fun serveBluetooth() {
    try {
      val adapter = BluetoothAdapter.getDefaultAdapter()
        ?: throw IllegalStateException("This phone does not support Bluetooth.")
      val listener = adapter.listenUsingRfcommWithServiceRecord(SERVICE_NAME, SERVICE_UUID)
      serverSocket = listener
      while (running) {
        val socket = try {
          listener.accept()
        } catch (error: IOException) {
          if (running) throw error else break
        }
        clientSocket = socket
        HeartRateRuntime.tabletConnected = true
        HeartRateRuntime.relayStatus = "Connected to the tablet"
        try {
          streamHeartRate(socket)
        } finally {
          HeartRateRuntime.tabletConnected = false
          try {
            socket.close()
          } catch (_: IOException) {
            // The peer may already have closed the connection.
          }
          if (clientSocket === socket) clientSocket = null
        }
        if (running) HeartRateRuntime.relayStatus = "Tablet disconnected; waiting for reconnection"
      }
    } catch (error: SecurityException) {
      HeartRateRuntime.relayStatus = "Allow Nearby devices access, then restart the bridge"
    } catch (error: Exception) {
      if (running) HeartRateRuntime.relayStatus =
        error.localizedMessage ?: "Bluetooth relay stopped unexpectedly"
    } finally {
      HeartRateRuntime.tabletConnected = false
      HeartRateRuntime.relayActive = false
      try {
        serverSocket?.close()
      } catch (_: IOException) {
        // Nothing remains to release.
      }
      serverSocket = null
      if (running) stopSelf()
    }
  }

  private fun streamHeartRate(socket: BluetoothSocket) {
    val writer = BufferedWriter(OutputStreamWriter(socket.outputStream, Charsets.UTF_8))
    while (running && socket.isConnected) {
      val packet = HeartRateRuntime.latestPacket
      val line = if (packet == null) {
        JSONObject()
          .put("bpm", JSONObject.NULL)
          .put("receivedAtMs", JSONObject.NULL)
      } else {
        JSONObject()
          .put("bpm", packet.bpm)
          .put("receivedAtMs", packet.receivedAtMs)
      }
      writer.write(line.toString())
      writer.newLine()
      writer.flush()
      try {
        Thread.sleep(1000)
      } catch (_: InterruptedException) {
        Thread.currentThread().interrupt()
        return
      }
    }
  }

  private fun startAsForegroundService() {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      NOTIFICATION_CHANNEL,
      "Heart-rate bridge",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Shows when the watch-to-tablet heart-rate relay is running."
    }
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, NOTIFICATION_CHANNEL)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    return builder
      .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
      .setContentTitle("Quad Video Player heart-rate bridge")
      .setContentText("Ready to relay readings to a paired tablet.")
      .setOngoing(true)
      .build()
  }

  override fun onDestroy() {
    running = false
    HeartRateRuntime.relayActive = false
    HeartRateRuntime.tabletConnected = false
    if (HeartRateRuntime.relayStatus.startsWith("Waiting") ||
      HeartRateRuntime.relayStatus.startsWith("Connected") ||
      HeartRateRuntime.relayStatus.startsWith("Tablet disconnected")) {
      HeartRateRuntime.relayStatus = "Stopped"
    }
    try {
      clientSocket?.close()
      serverSocket?.close()
    } catch (_: IOException) {
      // The worker will exit after its blocking socket closes.
    }
    relayThread?.interrupt()
    relayThread = null
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  companion object {
    const val SERVICE_UUID_TEXT = "7d9f4a14-04ca-4bdb-a173-8e1ec1e6d5c1"
    private val SERVICE_UUID: UUID = UUID.fromString(SERVICE_UUID_TEXT)
    private const val SERVICE_NAME = "Quad Video Player HR"
    private const val NOTIFICATION_CHANNEL = "qvp-heart-rate-bridge"
    private const val NOTIFICATION_ID = 8301
  }
}
