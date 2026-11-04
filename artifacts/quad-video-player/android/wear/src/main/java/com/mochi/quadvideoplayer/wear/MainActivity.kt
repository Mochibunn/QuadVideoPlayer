package com.mochi.quadvideoplayer.wear

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

class MainActivity : Activity() {
  private lateinit var statusText: TextView
  private lateinit var trackingButton: Button
  private lateinit var motionButton: Button
  private lateinit var permissionHelpText: TextView
  private lateinit var gameTypeface: Typeface
  private lateinit var displayTypeface: Typeface
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
    val density = resources.displayMetrics.density
    fun dp(value: Int) = (value * density).toInt()
    gameTypeface = Typeface.createFromAsset(assets, "fonts/yoster-island.ttf")
    displayTypeface = Typeface.createFromAsset(assets, "fonts/pixelta.ttf")
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(dp(14), dp(16), dp(14), dp(18))
      setBackgroundColor(android.graphics.Color.rgb(8, 8, 10))
    }
    root.addView(ImageView(this).apply {
      setImageResource(R.drawable.ic_gq_wear_launcher)
      contentDescription = "Goon Quest pixel paw icon"
      scaleType = ImageView.ScaleType.FIT_CENTER
    }, LinearLayout.LayoutParams(dp(44), dp(44)).apply { bottomMargin = dp(4) })
    statusText = TextView(this).apply {
      text = "Heart rate is off"
      textSize = 14f
      typeface = gameTypeface
      gravity = Gravity.CENTER
      setTextColor(android.graphics.Color.WHITE)
      setPadding(dp(8), dp(8), dp(8), dp(8))
    }
    trackingButton = Button(this).apply {
      text = "Start tracking"
      isAllCaps = false
      minHeight = dp(48)
      typeface = gameTypeface
      setTextColor(android.graphics.Color.WHITE)
      stylePillButton(this, android.graphics.Color.rgb(107, 92, 177), density)
      setOnClickListener {
        if (HeartRateTrackingState.active) stopTracking() else requestPermissionsAndStart()
      }
    }
    permissionHelpText = TextView(this).apply {
      text = "Tap to review permissions"
      textSize = 10f
      typeface = gameTypeface
      gravity = Gravity.CENTER
      setTextColor(android.graphics.Color.rgb(170, 170, 180))
      setPadding(dp(8), dp(7), dp(8), dp(8))
      contentDescription = "Review Goon Quest Link app permissions"
      setOnClickListener { openAppPermissionSettings() }
    }
    root.addView(TextView(this).apply {
      text = "GOON QUEST LINK · ${packageManager.getPackageInfo(packageName, 0).versionName}"
      textSize = 12f
      typeface = displayTypeface
      gravity = Gravity.CENTER
      setTextColor(android.graphics.Color.rgb(185, 173, 240))
      setPadding(dp(2), dp(2), dp(2), dp(6))
    })
    root.addView(statusText, LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
    ))
    root.addView(trackingButton, LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
    ).apply { topMargin = dp(3) })
    root.addView(permissionHelpText, LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
    ))
    motionButton = Button(this).apply {
      text = "Start wrist controls"
      isAllCaps = false
      minHeight = dp(48)
      typeface = gameTypeface
      setTextColor(android.graphics.Color.WHITE)
      stylePillButton(this, android.graphics.Color.rgb(57, 45, 92), density)
      setOnClickListener {
        if (MotionTrackingState.active) stopService(Intent(this@MainActivity, MotionTrackingService::class.java))
        else startMotionControls()
        renderTrackingState()
      }
    }
    root.addView(motionButton, LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
    ).apply { topMargin = dp(8) })
    root.addView(TextView(this).apply {
      text = "Small wrist movements only. Keep space around you. Controls stop after 15 minutes."
      textSize = 10f
      typeface = gameTypeface
      gravity = Gravity.CENTER
      setTextColor(android.graphics.Color.rgb(170, 170, 180))
      setPadding(dp(8), dp(8), dp(8), dp(12))
    })
    root.addView(Button(this).apply {
      text = "Battery access"
      typeface = gameTypeface
      setTextColor(android.graphics.Color.WHITE)
      backgroundTintList = null
      background = android.graphics.drawable.GradientDrawable().apply {
        setColor(android.graphics.Color.rgb(107, 92, 177))
        cornerRadius = 100f
      }
      setOnClickListener {
        val uri = android.net.Uri.parse("package:$packageName")
        try { startActivity(Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, uri)) }
        catch (_: Exception) { startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri)) }
      }
    })
    setContentView(ScrollView(this).apply {
      isFillViewport = true
      clipToPadding = false
      addView(root)
    })
  }

  private fun stylePillButton(button: Button, color: Int, density: Float) {
    fun pill(fillColor: Int) = GradientDrawable().apply {
      shape = GradientDrawable.RECTANGLE
      cornerRadius = 40f * density
      setColor(fillColor)
    }
    button.background = RippleDrawable(
      android.content.res.ColorStateList.valueOf(Color.argb(58, 255, 255, 255)),
      pill(color),
      pill(Color.WHITE),
    )
    button.backgroundTintList = null
    button.setPadding((12 * density).toInt(), 0, (12 * density).toInt(), 0)
  }

  private fun requestPermissionsAndStart() {
    val required = listOf(
      SensorPermissionPolicy.foreground(Build.VERSION.SDK_INT, applicationInfo.targetSdkVersion),
    )
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

  private fun backgroundSensorPermission(): String? =
    SensorPermissionPolicy.background(Build.VERSION.SDK_INT, applicationInfo.targetSdkVersion)

  private fun hasForegroundSensorAccess(): Boolean {
    val permission =
      SensorPermissionPolicy.foreground(Build.VERSION.SDK_INT, applicationInfo.targetSdkVersion)
    return checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
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
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        startForegroundService(intent)
      } else {
        startService(intent)
      }
    } catch (exception: Exception) {
      Log.e("GoonQuestHeartRate", "Could not launch tracking service", exception)
      HeartRateTrackingState.active = false
      HeartRateTrackingState.status =
        "Could not start: ${exception.javaClass.simpleName}: ${exception.message ?: "unknown error"}"
      renderTrackingState()
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
      HeartRateTrackingState.status != "Heart rate is off" -> HeartRateTrackingState.status
      !hasForegroundSensorAccess() -> "Heart-rate access is not allowed yet. Tap Start to request it."
      !hasBackgroundSensorAccess() -> "Heart-rate access is allowed. Tap Start to enable background access."
      else -> "Heart-rate access is already allowed. Tap Start to connect; no extra prompt is expected."
    }
    trackingButton.text = if (HeartRateTrackingState.active) "Stop tracking" else "Start tracking"
    if (::motionButton.isInitialized) {
      motionButton.text = if (MotionTrackingState.active) "Stop wrist controls" else "Start wrist controls"
      statusText.append("\n${MotionTrackingState.status}")
    }
    permissionHelpText.text =
      "Sensor: ${if (hasForegroundSensorAccess()) "allowed" else "not allowed"} · " +
      "Background: ${if (hasBackgroundSensorAccess()) "allowed" else "not allowed"}\n" +
      "Android API ${Build.VERSION.SDK_INT} · target ${applicationInfo.targetSdkVersion}\n" +
      "Tap here to review app permissions."
  }

  private fun openAppPermissionSettings() {
    startActivity(
      Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
        .setData(Uri.parse("package:$packageName")),
    )
  }

  private fun startMotionControls() {
    if (Build.VERSION.SDK_INT >= 31 &&
      checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(arrayOf(Manifest.permission.BLUETOOTH_CONNECT), REQUEST_MOTION_PERMISSION)
      return
    }
    try {
      val intent = Intent(this, MotionTrackingService::class.java)
      if (Build.VERSION.SDK_INT >= 26) startForegroundService(intent) else startService(intent)
    } catch (error: Exception) {
      MotionTrackingState.status = error.message ?: "Could not start wrist controls."
      renderTrackingState()
    }
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray,
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    when (requestCode) {
      REQUEST_MOTION_PERMISSION -> {
        if (Build.VERSION.SDK_INT < 31 ||
          checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED) startMotionControls()
        else { MotionTrackingState.status = "Nearby devices access is needed for wrist controls."; renderTrackingState() }
      }
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
    private const val REQUEST_MOTION_PERMISSION = 7104
  }
}
