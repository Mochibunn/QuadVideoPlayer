package com.mochi.quadvideoplayer.health

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HeartRateBridgeCodecTest {
  @Test
  fun acceptsOnlyPlausibleHeartRates() {
    val packet = HeartRateBridgeCodec.parsePayload(
      """{"bpm":72,"timestampMs":1}""",
      receivedAtMs = 1000L,
    )
    assertEquals(72, packet?.bpm)
    assertEquals(1000L, packet?.receivedAtMs)
    assertNull(HeartRateBridgeCodec.parsePayload("""{"bpm":0}""", 1000L))
    assertNull(HeartRateBridgeCodec.parsePayload("""{"bpm":241}""", 1000L))
    assertNull(HeartRateBridgeCodec.parsePayload("not json", 1000L))
  }

  @Test
  fun tabletRelayRoundTripsAndRejectsEmptyPackets() {
    val original = HeartRatePacket(91, 1730551234000L)
    val restored = HeartRateBridgeCodec.parseRelayLine(
      HeartRateBridgeCodec.encodePacket(original),
    )
    assertEquals(original, restored)
    assertNull(HeartRateBridgeCodec.parseRelayLine(HeartRateBridgeCodec.encodePacket(null)))
  }
}
