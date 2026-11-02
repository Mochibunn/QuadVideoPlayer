package com.mochi.quadvideoplayer.wear

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {
  private lateinit var statusText: TextView
  private lateinit var trackingButton: Button
  private lateinit var permissionHelpText: TextView
  private var stateReceiverRegistered = false

  private val stateReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      renderTrackingState()
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    buildScreen()
  }

  override fun onStart() {
    super.onStart()
    val filter = IntentFilter(HeartRateTrackingService.ACTION_STATE)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(stateReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("DEPRECATION")
      registerReceiver(stateReceiver, filter)
    }
    stateReceiverRegistered = true
    renderTrackingState()
  }

  override fun onStop() {
    if (stateReceiverRegistered) {
      unregisterReceiver(stateReceiver)
      stateReceiverRegistered = false
    }
    super.onStop()
  }

  override fun onResume() {
    super.onResume()
    renderTrackingState()
  }

  private fun buildScreen() {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(18, 16, 18, 16)
      setBackgroundColor(android.graphics.Color.rgb(8, 8, 10))
    }
    statusText = TextView(this).apply {
      text = "Heart rate is off"
      textSize = 15f
      gravity = Gravity.CENTER
      setTextColor(android.graphics.Color.WHITE)
      setPadding(8, 8, 8, 14)
    }
    trackingButton = Button(this).apply {
      text = "Start tracking"
      setOnClickListener {
        if (HeartRateTrackingState.active) stopTracking() else requestPermissionsAndStart()
      }
    }
    permissionHelpText = TextView(this).apply {
      text = "Android only shows a permission prompt when access is missing. Tap here to review app permissions."
      textSize = 11f
      gravity = Gravity.CENTER
      setTextColor(android.graphics.Color.rgb(170, 170, 180))
      setPadding(8, 14, 8, 4)
      contentDescription = "Review Goon Quest Link app permissions"
      setOnClickListener { openAppPermissionSettings() }
    }
    root.addView(statusText, LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
    ))
    root.addView(trackingButton, LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
    ))
    root.addView(permissionHelpText, LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
    ))
    setContentView(root)
  }

  private fun requestPermissionsAndStart() {
    val required = mutableListOf(Manifest.permission.BODY_SENSORS)
    if (Build.VERSION.SDK_INT >= 36) {
      required.add(PERMISSION_READ_HEART_RATE)
    }
    val missing = required.filter {
      checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED
    }
    if (missing.isNotEmpty()) {
      statusText.text = "Requesting heart-rate sensor access…"
      requestPermissions(missing.toTypedArray(), REQUEST_SENSOR_PERMISSIONS)
      return
    }
    statusText.text = "Access is already allowed. Connecting to the watch sensor…"
    requestBackgroundPermissionOrStart()
  }

  private fun requestBackgroundPermissionOrStart() {
    val permission = backgroundSensorPermission()
    if (permission == null || checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) {
      requestNotificationPermissionOrStart()
      return
    }
    statusText.text = "Allow background sensor access to keep readings active when this screen is hidden."
    requestPermissions(arrayOf(permission), REQUEST_BACKGROUND_PERMISSION)
  }

  private fun backgroundSensorPermission(): String? = when {
    Build.VERSION.SDK_INT >= 36 -> PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU -> Manifest.permission.BODY_SENSORS_BACKGROUND
    else -> null
  }

  private fun hasForegroundSensorAccess(): Boolean {
    val bodySensorsGranted =
      checkSelfPermission(Manifest.permission.BODY_SENSORS) == PackageManager.PERMISSION_GRANTED
    val heartRateGranted = Build.VERSION.SDK_INT < 36 ||
      checkSelfPermission(PERMISSION_READ_HEART_RATE) == PackageManager.PERMISSION_GRANTED
    return bodySensorsGranted && heartRateGranted
  }

  private fun hasBackgroundSensorAccess(): Boolean {
    val permission = backgroundSensorPermission() ?: return true
    return checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
  }

  private fun requestNotificationPermissionOrStart() {
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      requestPermissions(
        arrayOf(Manifest.permission.POST_NOTIFICATIONS),
        REQUEST_NOTIFICATION_PERMISSION,
      )
      return
    }
    startTrackingService()
  }

  private fun startTrackingService() {
    val intent = Intent(this, HeartRateTrackingService::class.java)
      .setAction(HeartRateTrackingService.ACTION_START)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      startForegroundService(intent)
    } else {
      startService(intent)
    }
  }

  private fun stopTracking() {
    startService(
      Intent(this, HeartRateTrackingService::class.java)
        .setAction(HeartRateTrackingService.ACTION_STOP),
    )
  }

  private fun renderTrackingState() {
    if (!::statusText.isInitialized) return
    statusText.text = when {
      HeartRateTrackingState.active -> HeartRateTrackingState.status
      !hasForegroundSensorAccess() -> "Heart-rate access is not allowed yet. Tap Start to request it."
      !hasBackgroundSensorAccess() -> "Heart-rate access is allowed. Tap Start to enable background access."
      else -> "Heart-rate access is already allowed. Tap Start to connect; no extra prompt is expected."
    }
    trackingButton.text = if (HeartRateTrackingState.active) "Stop tracking" else "Start tracking"
  }

  private fun openAppPermissionSettings() {
    startActivity(
      Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
        .setData(Uri.parse("package:$packageName")),
    )
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray,
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    when (requestCode) {
      REQUEST_SENSOR_PERMISSIONS -> {
        if (hasForegroundSensorAccess()) {
          requestBackgroundPermissionOrStart()
        } else {
          HeartRateTrackingState.status = "Allow heart-rate sensor access, then tap Start."
          renderTrackingState()
        }
      }
      REQUEST_BACKGROUND_PERMISSION -> {
        if (hasBackgroundSensorAccess()) {
          requestNotificationPermissionOrStart()
        } else {
          HeartRateTrackingState.status = "Background sensor access is needed to keep readings going."
          renderTrackingState()
          showBackgroundPermissionHelp()
        }
      }
      REQUEST_NOTIFICATION_PERMISSION -> startTrackingService()
    }
  }

  private fun showBackgroundPermissionHelp() {
    AlertDialog.Builder(this)
      .setTitle("Allow background sensor access")
      .setMessage(
        "Open Goon Quest Link permissions in watch Settings and allow background heart-rate access. " +
          "Then return here and tap Start again.",
      )
      .setPositiveButton("Open app settings") { _, _ ->
        startActivity(
          Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            .setData(Uri.parse("package:$packageName")),
        )
      }
      .setNegativeButton("Later", null)
      .show()
  }

  companion object {
    private const val REQUEST_SENSOR_PERMISSIONS = 7101
    private const val REQUEST_BACKGROUND_PERMISSION = 7102
    private const val REQUEST_NOTIFICATION_PERMISSION = 7103
    private const val PERMISSION_READ_HEART_RATE = "android.permission.READ_HEART_RATE"
    private const val PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND =
      "android.permission.READ_HEALTH_DATA_IN_BACKGROUND"
  }
}
