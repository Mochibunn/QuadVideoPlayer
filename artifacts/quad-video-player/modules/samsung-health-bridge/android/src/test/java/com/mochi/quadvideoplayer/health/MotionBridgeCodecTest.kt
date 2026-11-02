package com.mochi.quadvideoplayer.health

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class MotionBridgeCodecTest {
  private val raw = """{"session":"watch-123","sequence":12,"gestureSeq":2,"x":3,"y":4,"z":0}"""
  @Test fun roundTripPreservesGestureIdentityAndAccountsForRelayAge() {
    val phone = MotionBridgeCodec.parsePayload(raw, 10000)!!
    val line = JSONObject().put("motion", MotionBridgeCodec.relayJson(phone, 10200)).toString()
    val tablet = MotionBridgeCodec.parseRelayLine(line, 50000)!!
    assertEquals(49800L, tablet.receivedAtMs)
    val state = MotionBridgeCodec.state(tablet, true, 50100)
    assertEquals(true, state["available"])
    assertEquals("watch-123:2", state["gestureId"])
    assertEquals(5.0, state["magnitude"])
  }
  @Test fun rejectsMalformedExtremeAndStaleSamples() {
    assertNull(MotionBridgeCodec.parsePayload("not json", 1000))
    assertNull(MotionBridgeCodec.parsePayload(raw.replace("\"x\":3", "\"x\":9999"), 1000))
    assertNull(MotionBridgeCodec.parsePayload(raw.replace("\"sequence\":12", "\"sequence\":0"), 1000))
    assertNull(MotionBridgeCodec.parseRelayLine("""{"motion":{"ageMs":999999}}""", 50000))
    val packet = MotionBridgeCodec.parsePayload(raw, 10000)!!
    assertEquals(false, MotionBridgeCodec.state(packet, true, 13000)["available"])
    assertNull(MotionBridgeCodec.state(packet, true, 13000)["gestureId"])
    assertEquals(false, MotionBridgeCodec.state(packet, false, 10001)["available"])
  }
}
