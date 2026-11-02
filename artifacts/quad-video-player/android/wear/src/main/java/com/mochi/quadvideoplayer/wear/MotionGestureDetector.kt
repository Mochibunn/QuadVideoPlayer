package com.mochi.quadvideoplayer.wear

import kotlin.math.sqrt

/** Deliberate small wrist swings, not position tracking or a medical measurement. */
class MotionGestureDetector {
  private var startedAt = -1L
  private var lastGestureAt = -1L
  private var peaks = 0

  fun sample(x: Float, y: Float, z: Float, now: Long): Boolean {
    if (!x.isFinite() || !y.isFinite() || !z.isFinite() || now < 0) { peaks = 0; return false }
    if (startedAt < 0 || now < startedAt) { startedAt = now; peaks = 0; lastGestureAt = -1 }
    if (now - startedAt < 1_000) return false
    val magnitude = sqrt(x * x + y * y + z * z)
    peaks = if (magnitude >= 4.5f) peaks + 1 else 0
    if (peaks < 2 || (lastGestureAt >= 0 && now - lastGestureAt < 900)) return false
    lastGestureAt = now
    peaks = 0
    return true
  }
}
