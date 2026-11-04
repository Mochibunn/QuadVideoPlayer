package com.mochi.quadvideoplayer.health

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import java.io.BufferedReader
import java.io.IOException
import java.io.InputStreamReader
import java.util.UUID

object TabletBluetoothClient {
  @Volatile private var socket: BluetoothSocket? = null
  @Volatile private var readerThread: Thread? = null
  @Volatile private var latestPacket: HeartRatePacket? = null
  @Volatile private var latestMotion: MotionPacket? = null
  @Volatile private var connected = false
  @Volatile private var status = "Not connected"

  private val connectionLock = Any()
  private var generation = 0
  @Volatile private var pendingSocket: BluetoothSocket? = null

  @SuppressLint("MissingPermission")
  fun connect(adapter: BluetoothAdapter, deviceAddress: String): Map<String, Any?> {
    disconnect()
    val attempt = synchronized(connectionLock) { generation }
    val device: BluetoothDevice = try {
      adapter.getRemoteDevice(deviceAddress)
    } catch (_: IllegalArgumentException) {
      throw IllegalArgumentException("Choose a paired phone from the device list.")
    }
    val candidate = device.createRfcommSocketToServiceRecord(
      UUID.fromString(PhoneRelayService.SERVICE_UUID_TEXT),
    )
    synchronized(connectionLock) {
      if (attempt != generation) { candidate.close(); return state() }
      pendingSocket = candidate
      status = "Connecting to phone bridge…"
    }
    try {
      candidate.connect()
    } catch (error: Exception) {
      try {
        candidate.close()
      } catch (_: IOException) {
        // The connection attempt already failed.
      }
      synchronized(connectionLock) {
        if (attempt == generation) {
          connected = false
          status = error.localizedMessage ?: "Could not connect to the phone bridge."
        }
        if (pendingSocket === candidate) pendingSocket = null
      }
      throw IllegalStateException(status, error)
    }

    synchronized(connectionLock) {
      if (attempt != generation) { candidate.close(); return state() }
      pendingSocket = null
      socket = candidate
      connected = true
      status = "Connected to ${device.name ?: "paired phone"}"
      readerThread = Thread({ readHeartRate(candidate) }, "qvp-heart-rate-client").also { it.start() }
    }
    return state()
  }

  fun disconnect(): Map<String, Any?> = synchronized(connectionLock) {
    generation++
    try { pendingSocket?.close() } catch (_: IOException) { }
    pendingSocket = null
    connected = false
    latestMotion = null
    try {
      socket?.close()
    } catch (_: IOException) {
      // Socket is already closed.
    }
    socket = null
    readerThread?.interrupt()
    readerThread = null
    status = "Not connected"
    state()
  }

  fun state(): Map<String, Any?> {
    val packet = latestPacket
    return mapOf(
      "connected" to connected,
      "status" to status,
      "bpm" to packet?.bpm,
      "receivedAtMs" to packet?.receivedAtMs,
    )
  }

  fun motionState(): Map<String, Any?> =
    MotionBridgeCodec.state(latestMotion, connected, System.currentTimeMillis())

  private fun readHeartRate(source: BluetoothSocket) {
    try {
      val reader = BufferedReader(InputStreamReader(source.inputStream, Charsets.UTF_8))
      while (!Thread.currentThread().isInterrupted) {
        val line = reader.readLine() ?: break
        HeartRateBridgeCodec.parseRelayLine(line)?.let { latestPacket = it }
        if (socket !== source) break
        MotionBridgeCodec.parseRelayLine(line, System.currentTimeMillis())?.let { incoming ->
          val previous = latestMotion
          if (previous == null || incoming.session != previous.session || incoming.sequence > previous.sequence)
            latestMotion = incoming
        }
      }
      if (socket === source) {
        connected = false
        status = "Phone bridge disconnected"
      }
    } catch (error: Exception) {
      if (socket === source) {
        connected = false
        status = error.localizedMessage ?: "Phone bridge disconnected"
      }
    } finally {
      if (socket === source) {
        try {
          source.close()
        } catch (_: IOException) {
          // Already closed.
        }
        socket = null
      }
    }
  }
}
