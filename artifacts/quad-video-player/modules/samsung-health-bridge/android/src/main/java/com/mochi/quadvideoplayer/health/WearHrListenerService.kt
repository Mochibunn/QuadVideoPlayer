package com.mochi.quadvideoplayer.health

import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService

class WearHrListenerService : WearableListenerService() {
  override fun onMessageReceived(messageEvent: MessageEvent) {
    if (messageEvent.path != HEART_RATE_PATH) {
      super.onMessageReceived(messageEvent)
      return
    }

    val payload = String(messageEvent.data, Charsets.UTF_8)
    val packet = HeartRateBridgeCodec.parsePayload(payload, System.currentTimeMillis())
    if (packet != null) {
      HeartRateRuntime.latestPacket = packet
    }
    super.onMessageReceived(messageEvent)
  }

  companion object {
    private const val HEART_RATE_PATH = "/qvp/hr"
  }
}
