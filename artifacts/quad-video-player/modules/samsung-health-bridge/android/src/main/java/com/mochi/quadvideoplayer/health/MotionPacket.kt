package com.mochi.quadvideoplayer.health

import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.sqrt

data class MotionPacket(
  val session: String, val sequence: Long, val gestureSeq: Long,
  val x: Double, val y: Double, val z: Double, val receivedAtMs: Long,
)

object MotionRuntime {
  @Volatile var latest: MotionPacket? = null
}

object MotionBridgeCodec {
  fun parsePayload(payload: String, now: Long): MotionPacket? {
    if (payload.length > 2048) return null
    return try { parseObject(JSONObject(payload), now) } catch (_: Exception) { null }
  }
  private fun parseObject(json: JSONObject, receivedAt: Long): MotionPacket? {
    val session = json.optString("session")
    val seq = json.optLong("sequence", -1)
    val gesture = json.optLong("gestureSeq", -1)
    val x = json.optDouble("x", Double.NaN)
    val y = json.optDouble("y", Double.NaN)
    val z = json.optDouble("z", Double.NaN)
    if (!session.matches(Regex("[a-zA-Z0-9-]{1,64}")) || seq <= 0 || gesture < 0 ||
      receivedAt <= 0 || listOf(x, y, z).any { !it.isFinite() || abs(it) > 80 }) return null
    return MotionPacket(session, seq, gesture, x, y, z, receivedAt)
  }
  fun relayJson(packet: MotionPacket?, now: Long): Any {
    if (packet == null) return JSONObject.NULL
    return JSONObject().put("session", packet.session).put("sequence", packet.sequence)
      .put("gestureSeq", packet.gestureSeq)
      .put("x", packet.x).put("y", packet.y).put("z", packet.z)
      .put("ageMs", (now - packet.receivedAtMs).coerceAtLeast(0))
  }
  fun parseRelayLine(line: String, now: Long): MotionPacket? {
    if (line.length > 4096) return null
    return try {
      val json = JSONObject(line).optJSONObject("motion") ?: return null
      val age = json.optLong("ageMs", -1)
      if (age !in 0L..5000L) null else parseObject(json, now - age)
    } catch (_: Exception) { null }
  }
  fun state(packet: MotionPacket?, connected: Boolean, now: Long): Map<String, Any?> {
    val available = connected && packet != null && now - packet.receivedAtMs in 0L..2500L
    return mapOf(
      "connected" to connected, "available" to available,
      "status" to if (!connected) "Connect to your phone bridge first." else if (!available)
        "Waiting for fresh watch movement. Start wrist controls on the watch." else "Live watch movement",
      "x" to if (available) packet?.x else null,
      "y" to if (available) packet?.y else null,
      "z" to if (available) packet?.z else null,
      "magnitude" to if (available && packet != null) sqrt(packet.x * packet.x + packet.y * packet.y + packet.z * packet.z) else null,
      "gestureId" to if (available && packet != null && packet.gestureSeq > 0) "${packet.session}:${packet.gestureSeq}" else null,
      "receivedAtMs" to packet?.receivedAtMs,
    )
  }
}
