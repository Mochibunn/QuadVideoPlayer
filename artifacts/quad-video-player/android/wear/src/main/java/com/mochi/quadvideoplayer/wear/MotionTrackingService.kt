package com.mochi.quadvideoplayer.wear

import android.Manifest
import android.app.*
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import com.google.android.gms.wearable.Wearable
import org.json.JSONObject
import java.util.UUID
import kotlin.math.sqrt

object MotionTrackingState {
  @Volatile var active = false
  @Volatile var status = "Motion controls off"
}

/** Explicitly started from the watch screen; independent of the Samsung HR SDK. */
class MotionTrackingService : Service(), SensorEventListener {
  private lateinit var sensors: SensorManager
  private var sensor: Sensor? = null
  private val detector = MotionGestureDetector()
  private val session = UUID.randomUUID().toString()
  private val gravity = FloatArray(3)
  private var gravityReady = false
  private var sequence = 0L
  private var gestureSequence = 0L
  private var lastSent = 0L
  private var lastNodeRefresh = 0L
  private var nodes: List<String> = emptyList()
  private var nodeLookupPending = false
  private var wakeLock: PowerManager.WakeLock? = null
  private val handler = Handler(Looper.getMainLooper())

  override fun onCreate() {
    super.onCreate()
    sensors = getSystemService(SENSOR_SERVICE) as SensorManager
    sensor = sensors.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)
      ?: sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(
      NotificationChannel(CHANNEL, "Watch game controls", NotificationManager.IMPORTANCE_LOW),
    )
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) { stopSelf(); return START_NOT_STICKY }
    if (MotionTrackingState.active) return START_NOT_STICKY
    if (Build.VERSION.SDK_INT >= 31 &&
      checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
      MotionTrackingState.status = "Allow Nearby devices for motion controls."
      stopSelf()
      return START_NOT_STICKY
    }
    if (sensor == null) {
      MotionTrackingState.status = "This watch has no supported motion sensor."
      stopSelf()
      return START_NOT_STICKY
    }
    try {
      val pending = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      val stop = PendingIntent.getService(this, 1,
        Intent(this, MotionTrackingService::class.java).setAction(ACTION_STOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      val notification = Notification.Builder(this, CHANNEL)
        .setSmallIcon(android.R.drawable.ic_media_play)
        .setContentTitle("Goon Quest · wrist controls")
        .setContentText("Small wrist swings control your tablet mini-game. Tap to stop.")
        .setContentIntent(pending).setOngoing(true)
        .addAction(android.R.drawable.ic_media_pause, "Stop wrist controls", stop).build()
      if (Build.VERSION.SDK_INT >= 29) startForeground(42, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
      else startForeground(42, notification)
      if (!sensors.registerListener(this, sensor, 50_000)) throw IllegalStateException("Motion sensor could not start.")
      // A foreground service alone does not keep non-wakeup accelerometers sampling.
      // Bound both the CPU lock and the entire explicit motion session for battery safety.
      wakeLock = (getSystemService(POWER_SERVICE) as PowerManager)
        .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "GoonQuest:WristArcade").apply { acquire(MAX_SESSION_MS) }
      handler.postDelayed({
        MotionTrackingState.status = "Wrist controls stopped after 15 minutes. Tap Start to continue."
        stopSelf()
      }, MAX_SESSION_MS)
      MotionTrackingState.active = true
      MotionTrackingState.status = "Motion ready · waiting for paired phone"
      broadcastState()
    } catch (error: Exception) {
      MotionTrackingState.status = error.message ?: "Motion controls could not start."
      stopSelf()
    }
    return START_NOT_STICKY
  }

  override fun onSensorChanged(event: SensorEvent) {
    if (!MotionTrackingState.active || event.values.size < 3) return
    val values = event.values.take(3).toFloatArray()
    if (values.any { !it.isFinite() }) return
    if (event.sensor.type == Sensor.TYPE_ACCELEROMETER) {
      if (!gravityReady) { for (i in 0..2) gravity[i] = values[i]; gravityReady = true }
      for (i in 0..2) {
        gravity[i] = 0.85f * gravity[i] + 0.15f * values[i]
        values[i] -= gravity[i]
      }
    }
    for (i in 0..2) values[i] = values[i].coerceIn(-40f, 40f)
    val elapsed = event.timestamp / 1_000_000L
    if (detector.sample(values[0], values[1], values[2], elapsed)) gestureSequence++
    if (elapsed - lastSent < 200) return
    lastSent = elapsed
    if (!nodeLookupPending && (lastNodeRefresh == 0L || elapsed - lastNodeRefresh >= 15_000)) {
      lastNodeRefresh = elapsed
      nodeLookupPending = true
      Wearable.getNodeClient(this).connectedNodes.addOnSuccessListener {
        nodes = it.map { node -> node.id }
      }.addOnCompleteListener { nodeLookupPending = false }
    }
    val payload = JSONObject().put("session", session).put("sequence", ++sequence)
      .put("gestureSeq", gestureSequence)
      .put("x", values[0].toDouble()).put("y", values[1].toDouble()).put("z", values[2].toDouble())
      .toString().toByteArray(Charsets.UTF_8)
    nodes.forEach { node ->
      Wearable.getMessageClient(this).sendMessage(node, "/qvp/motion", payload)
        .addOnFailureListener { MotionTrackingState.status = "Motion waiting for phone reconnection" }
    }
    if (nodes.isNotEmpty()) MotionTrackingState.status =
      "Motion sending · ${"%.1f".format(sqrt(values.sumOf { (it * it).toDouble() }))} m/s²"
    if (sequence % 5L == 0L) broadcastState()
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
  override fun onBind(intent: Intent?): IBinder? = null
  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    sensors.unregisterListener(this)
    MotionTrackingState.active = false
    if (MotionTrackingState.status.startsWith("Motion sending") || MotionTrackingState.status.startsWith("Motion ready"))
      MotionTrackingState.status = "Motion controls off"
    stopForeground(STOP_FOREGROUND_REMOVE)
    broadcastState()
    super.onDestroy()
  }
  private fun broadcastState() {
    sendBroadcast(Intent(HeartRateTrackingService.ACTION_STATE).setPackage(packageName))
  }
  companion object {
    const val ACTION_STOP = "com.mochi.quadvideoplayer.STOP_MOTION"
    private const val MAX_SESSION_MS = 15 * 60 * 1000L
    private const val CHANNEL = "goon-quest-motion"
  }
}
