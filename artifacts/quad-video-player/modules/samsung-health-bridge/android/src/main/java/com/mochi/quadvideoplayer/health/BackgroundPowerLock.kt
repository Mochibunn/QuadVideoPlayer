package com.mochi.quadvideoplayer.health

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.PowerManager

/** A bounded CPU lock only while the user-requested foreground bridge is active. */
class BackgroundPowerLock(context: Context, tag: String) {
  private val handler = Handler(Looper.getMainLooper())
  private val lock = (context.getSystemService(Context.POWER_SERVICE) as PowerManager)
    .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, tag).apply { setReferenceCounted(false) }
  private val renew = object : Runnable {
    override fun run() {
      lock.acquire(5 * 60_000L)
      handler.postDelayed(this, 4 * 60_000L)
    }
  }
  fun start() { handler.removeCallbacks(renew); renew.run() }
  fun stop() { handler.removeCallbacks(renew); if (lock.isHeld) lock.release() }
}
