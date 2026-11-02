package com.mochi.quadvideoplayer.health

import org.json.JSONObject

data class HeartRatePacket(
  val bpm: Int,
  val receivedAtMs: Long,
)

object HeartRateRuntime {
  @Volatile var latestPacket: HeartRatePacket? = null
  @Volatile var relayActive: Boolean = false
  @Volatile var relayStatus: String = "Stopped"
  @Volatile var tabletConnected: Boolean = false
}

object HeartRateBridgeCodec {
  const val MIN_BPM = 20
  const val MAX_BPM = 240

  fun parsePayload(payload: String, receivedAtMs: Long): HeartRatePacket? {
    return try {
      val json = JSONObject(payload)
      val bpm = json.optInt("bpm", -1)
      if (bpm !in MIN_BPM..MAX_BPM || receivedAtMs <= 0) {
        null
      } else {
        HeartRatePacket(bpm, receivedAtMs)
      }
    } catch (_: Exception) {
      null
    }
  }

  fun encodePacket(packet: HeartRatePacket?): String {
    val json = JSONObject()
    if (packet == null) {
      json.put("bpm", JSONObject.NULL)
      json.put("receivedAtMs", JSONObject.NULL)
    } else {
      json.put("bpm", packet.bpm)
      json.put("receivedAtMs", packet.receivedAtMs)
    }
    return json.toString()
  }

  fun parseRelayLine(line: String): HeartRatePacket? {
    return try {
      val json = JSONObject(line)
      val bpm = if (json.isNull("bpm")) -1 else json.optInt("bpm", -1)
      val receivedAtMs = if (json.isNull("receivedAtMs")) 0L else json.optLong("receivedAtMs", 0L)
      if (bpm !in MIN_BPM..MAX_BPM || receivedAtMs <= 0L) {
        null
      } else {
        HeartRatePacket(bpm, receivedAtMs)
      }
    } catch (_: Exception) {
      null
    }
  }
}
