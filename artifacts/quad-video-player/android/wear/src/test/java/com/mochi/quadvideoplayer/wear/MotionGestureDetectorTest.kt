package com.mochi.quadvideoplayer.wear

import org.junit.Assert.*
import org.junit.Test

class MotionGestureDetectorTest {
  @Test fun warmupAndQuietReadingsNeverSwing() {
    val detector = MotionGestureDetector()
    for (time in 0L..2000L step 50) assertFalse(detector.sample(0.2f, 0.1f, 0.2f, time))
    val warming = MotionGestureDetector()
    assertFalse(warming.sample(8f, 0f, 0f, 100))
    assertFalse(warming.sample(8f, 0f, 0f, 150))
  }
  @Test fun requiresConsecutivePeaksAndDebouncesSwings() {
    val detector = MotionGestureDetector()
    detector.sample(0f, 0f, 0f, 0)
    assertFalse(detector.sample(6f, 0f, 0f, 1050))
    assertTrue(detector.sample(6f, 0f, 0f, 1100))
    assertFalse(detector.sample(6f, 0f, 0f, 1150))
    assertFalse(detector.sample(6f, 0f, 0f, 1200))
    assertTrue(detector.sample(6f, 0f, 0f, 2050))
  }
  @Test fun invalidSamplesCannotCreateGestures() {
    val detector = MotionGestureDetector()
    assertFalse(detector.sample(Float.NaN, 0f, 0f, 100))
    assertFalse(detector.sample(6f, 0f, 0f, -1))
  }
}
