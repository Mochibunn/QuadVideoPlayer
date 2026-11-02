package com.mochi.quadvideoplayer.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SensorPermissionPolicyTest {
  @Test fun android16WithLegacyTargetStillUsesBodySensors() {
    assertEquals("android.permission.BODY_SENSORS", SensorPermissionPolicy.foreground(36, 35))
    assertEquals(
      "android.permission.BODY_SENSORS_BACKGROUND",
      SensorPermissionPolicy.background(36, 35),
    )
  }

  @Test fun futureDevicesDoNotChangeLegacyTargetPermissions() {
    assertEquals("android.permission.BODY_SENSORS", SensorPermissionPolicy.foreground(37, 35))
    assertEquals(
      "android.permission.BODY_SENSORS_BACKGROUND",
      SensorPermissionPolicy.background(37, 35),
    )
  }

  @Test fun android16TargetUsesHealthNamespaceWithoutRequiringBothPermissions() {
    assertEquals("android.permission.health.READ_HEART_RATE", SensorPermissionPolicy.foreground(36, 36))
    assertEquals(
      "android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND",
      SensorPermissionPolicy.background(36, 36),
    )
  }

  @Test fun olderDevicesUseLegacyPermissionsEvenWithNewTarget() {
    assertEquals("android.permission.BODY_SENSORS", SensorPermissionPolicy.foreground(35, 36))
    assertEquals(
      "android.permission.BODY_SENSORS_BACKGROUND",
      SensorPermissionPolicy.background(35, 36),
    )
  }

  @Test fun android11DoesNotRequestUnavailableBackgroundPermission() {
    assertEquals("android.permission.BODY_SENSORS", SensorPermissionPolicy.foreground(30, 35))
    assertNull(SensorPermissionPolicy.background(30, 35))
  }
}
