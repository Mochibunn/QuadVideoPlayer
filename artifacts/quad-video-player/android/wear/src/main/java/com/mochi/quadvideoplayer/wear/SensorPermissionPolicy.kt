package com.mochi.quadvideoplayer.wear

/** Permission migration depends on both the device API and the app's target API. */
object SensorPermissionPolicy {
  const val BODY_SENSORS = "android.permission.BODY_SENSORS"
  const val BODY_SENSORS_BACKGROUND = "android.permission.BODY_SENSORS_BACKGROUND"
  const val READ_HEART_RATE = "android.permission.health.READ_HEART_RATE"
  const val READ_HEALTH_DATA_IN_BACKGROUND =
    "android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND"

  fun foreground(deviceApi: Int, targetApi: Int): String =
    if (deviceApi >= 36 && targetApi >= 36) READ_HEART_RATE else BODY_SENSORS

  fun background(deviceApi: Int, targetApi: Int): String? = when {
    deviceApi >= 36 && targetApi >= 36 -> READ_HEALTH_DATA_IN_BACKGROUND
    deviceApi >= 33 -> BODY_SENSORS_BACKGROUND
    else -> null
  }
}
