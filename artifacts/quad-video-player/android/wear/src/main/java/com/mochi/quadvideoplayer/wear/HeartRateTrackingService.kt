package com.mochi.quadvideoplayer.wear

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import com.google.android.gms.wearable.Wearable
import com.samsung.android.service.health.tracking.ConnectionListener
import com.samsung.android.service.health.tracking.HealthTracker
import com.samsung.android.service.health.tracking.HealthTrackerException
import com.samsung.android.service.health.tracking.HealthTrackingService
import com.samsung.android.service.health.tracking.data.DataPoint
import com.samsung.android.service.health.tracking.data.HealthTrackerType
import com.samsung.android.service.health.tracking.data.ValueKey
import org.json.JSONObject
import kotlin.math.min

object HeartRateTrackingState {
  @Volatile var active: Boolean = false
  @Volatile var status: String = "Heart rate is off"
}

class HeartRateTrackingService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var trackingRequested = false
  private var reconnectPending = false
  private var reconnectAttempts = 0
  private var sensorService: HealthTrackingService? = null
  private var heartRateTracker: HealthTracker? = null
  private var lastReadingElapsedMs = 0L
  private var lastNotificationText = ""
  private var lastNotificationUpdateMs = 0L
  private var cpuLock: android.os.PowerManager.WakeLock? = null
  private var lockRenewedAtMs = 0L
  private fun keepSensorAwake() {
    val now = SystemClock.elapsedRealtime()
    if (cpuLock == null) cpuLock = (getSystemService(POWER_SERVICE) as android.os.PowerManager)
      .newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "GoonQuest:WatchHR")
      .apply { setReferenceCounted(false) }
    if (cpuLock?.isHeld != true || now - lockRenewedAtMs >= 4 * 60_000L) {
      cpuLock?.acquire(5 * 60_000L)
      lockRenewedAtMs = now
    }
  }

  private val watchdog = object : Runnable {
    override fun run() {
      if (!trackingRequested) return
      keepSensorAwake()
      val now = SystemClock.elapsedRealtime()
      val reference = if (lastReadingElapsedMs == 0L) connectionStartedAtMs else lastReadingElapsedMs
      if (reference > 0L && now - reference >= READING_TIMEOUT_MS) {
        scheduleReconnect("No recent heart-rate data; reconnecting to the watch sensor…")
      }
      handler.postDelayed(this, WATCHDOG_INTERVAL_MS)
    }
  }

  private var connectionStartedAtMs = 0L

  private val connectionListener = object : ConnectionListener {
    override fun onConnectionSuccess() {
      handler.post { beginHeartRateTracking() }
    }

    override fun onConnectionEnded() {
      handler.post {
        if (trackingRequested) scheduleReconnect("Sensor service disconnected; reconnecting…")
      }
    }

    override fun onConnectionFailed(exception: HealthTrackerException) {
      handler.post {
        if (trackingRequested) {
          Log.e("GoonQuestHeartRate", "Samsung sensor connection failed", exception)
          scheduleReconnect(
            "Samsung connection error ${exception.errorCode}: " +
              "${exception.message ?: "service unavailable"}. Retrying…",
          )
        }
      }
    }
  }

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopTracking(clearSavedRequest = true)
      return START_NOT_STICKY
    }

    val preferences = getSharedPreferences(REQUESTED_PREFS, MODE_PRIVATE)
    if (intent?.action == ACTION_START) {
      preferences.edit().putBoolean(PREF_TRACKING_REQUESTED, true).apply()
    }
    trackingRequested = preferences.getBoolean(PREF_TRACKING_REQUESTED, false)
    if (!trackingRequested) {
      stopSelf(startId)
      return START_NOT_STICKY
    }

    if (!hasSensorPermission()) {
      failTracking("Allow heart-rate sensor access, then start tracking again.")
      return START_NOT_STICKY
    }
    try {
      startAsForegroundService()
    } catch (exception: Exception) {
      Log.e("GoonQuestHeartRate", "Health foreground service could not start", exception)
      failTracking(
        "Tracking could not start: ${exception.javaClass.simpleName}: " +
          "${exception.message ?: "unknown error"}",
      )
      return START_NOT_STICKY
    }
    HeartRateTrackingState.active = true
    keepSensorAwake()

    publishStatus("Connecting to the watch sensor…")
    connectToSensor()
    handler.removeCallbacks(watchdog)
    handler.postDelayed(watchdog, WATCHDOG_INTERVAL_MS)
    return START_STICKY
  }

  private fun hasSensorPermission(): Boolean {
    val permission =
      SensorPermissionPolicy.foreground(Build.VERSION.SDK_INT, applicationInfo.targetSdkVersion)
    return checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
  }

  private fun connectToSensor() {
    if (!trackingRequested || sensorService != null) return
    connectionStartedAtMs = SystemClock.elapsedRealtime()
    try {
      sensorService = HealthTrackingService(connectionListener, this).also {
        it.connectService()
      }
    } catch (exception: Exception) {
      Log.e("GoonQuestHeartRate", "Samsung sensor connection threw", exception)
      scheduleReconnect("Sensor connection failed: ${exception.javaClass.simpleName}. Retrying…")
    }
  }

  private fun beginHeartRateTracking() {
    if (!trackingRequested || heartRateTracker != null) return
    val service = sensorService ?: return
    val supported = service.trackingCapability?.supportHealthTrackerTypes.orEmpty()
    if (!supported.contains(HealthTrackerType.HEART_RATE_CONTINUOUS)) {
      failTracking("Continuous heart rate is unavailable on this watch.")
      return
    }

    try {
      val tracker = service.getHealthTracker(HealthTrackerType.HEART_RATE_CONTINUOUS)
      heartRateTracker = tracker
      lastReadingElapsedMs = 0L
      connectionStartedAtMs = SystemClock.elapsedRealtime()
      tracker.setEventListener(object : HealthTracker.TrackerEventListener {
        override fun onDataReceived(dataPoints: MutableList<DataPoint>) {
          dataPoints.forEach { point ->
            val bpm = point.getValue(ValueKey.HeartRateSet.HEART_RATE) ?: return@forEach
            if (bpm !in MIN_BPM..MAX_BPM) return@forEach
            val receivedAt = System.currentTimeMillis()
            handler.post {
              if (!trackingRequested) return@post
              lastReadingElapsedMs = SystemClock.elapsedRealtime()
              reconnectAttempts = 0
              publishStatus("Live: $bpm BPM", updateNotification = false)
              updateNotificationIfNeeded("Live: $bpm BPM")
            }
            sendReadingToPhone(bpm, receivedAt)
          }
        }

        override fun onFlushCompleted() = Unit

        override fun onError(error: HealthTracker.TrackerError) {
          handler.post {
            if (!trackingRequested) return@post
            if (error == HealthTracker.TrackerError.SDK_POLICY_ERROR) {
              failTracking("Samsung SDK_POLICY_ERROR: check Samsung Health Sensor Service developer mode on the watch.")
            } else if (error == HealthTracker.TrackerError.PERMISSION_ERROR) {
              failTracking("Samsung PERMISSION_ERROR: heart-rate access was rejected by the sensor service.")
            } else {
              scheduleReconnect("Heart-rate sensor paused; reconnecting…")
            }
          }
        }
      })
      publishStatus("Sensor connected. Waiting for a reading…")
    } catch (exception: Exception) {
      Log.e("GoonQuestHeartRate", "Could not register heart-rate tracker", exception)
      scheduleReconnect("Tracker start failed: ${exception.javaClass.simpleName}. Retrying…")
    }
  }

  private fun scheduleReconnect(message: String) {
    if (!trackingRequested || reconnectPending) return
    reconnectPending = true
    reconnectAttempts = (reconnectAttempts + 1).coerceAtMost(MAX_RECONNECT_ATTEMPTS)
    val delayMs = min(
      MAX_RECONNECT_DELAY_MS,
      INITIAL_RECONNECT_DELAY_MS * (1L shl (reconnectAttempts - 1)),
    )
    publishStatus(message)
    disconnectSensor()
    handler.postDelayed({
      reconnectPending = false
      if (trackingRequested) connectToSensor()
    }, delayMs)
  }

  private fun disconnectSensor() {
    try {
      heartRateTracker?.unsetEventListener()
    } catch (_: Exception) {
      // The tracker may already have stopped.
    }
    heartRateTracker = null
    try {
      sensorService?.disconnectService()
    } catch (_: Exception) {
      // The service may already be disconnected.
    }
    sensorService = null
  }

  private fun sendReadingToPhone(bpm: Int, timestampMs: Long) {
    val payload = JSONObject()
      .put("bpm", bpm)
      .put("timestampMs", timestampMs)
      .toString()
      .toByteArray(Charsets.UTF_8)

    Wearable.getNodeClient(this).connectedNodes
      .addOnSuccessListener { nodes ->
        nodes.forEach { node ->
          Wearable.getMessageClient(this)
            .sendMessage(node.id, HEART_RATE_PATH, payload)
        }
      }
  }

  private fun failTracking(message: String) {
    stopTracking(clearSavedRequest = true)
    publishStatus(message)
  }

  private fun stopTracking(clearSavedRequest: Boolean) {
    if (cpuLock?.isHeld == true) cpuLock?.release()
    trackingRequested = false
    reconnectPending = false
    handler.removeCallbacks(watchdog)
    handler.removeCallbacksAndMessages(null)
    disconnectSensor()
    HeartRateTrackingState.active = false
    if (clearSavedRequest) {
      getSharedPreferences(REQUESTED_PREFS, MODE_PRIVATE)
        .edit()
        .putBoolean(PREF_TRACKING_REQUESTED, false)
        .apply()
    }
    publishStatus("Heart rate is off")
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun publishStatus(message: String, updateNotification: Boolean = true) {
    HeartRateTrackingState.active = trackingRequested
    HeartRateTrackingState.status = message
    sendBroadcast(
      Intent(ACTION_STATE)
        .setPackage(packageName)
        .putExtra(EXTRA_STATUS, message)
        .putExtra(EXTRA_ACTIVE, trackingRequested),
    )
    if (updateNotification && trackingRequested) updateNotificationIfNeeded(message, force = true)
  }

  private fun updateNotificationIfNeeded(message: String, force: Boolean = false) {
    val now = SystemClock.elapsedRealtime()
    if (!force && now - lastNotificationUpdateMs < NOTIFICATION_REFRESH_MS) {
      return
    }
    lastNotificationText = message
    lastNotificationUpdateMs = now
    getSystemService(NotificationManager::class.java)
      .notify(NOTIFICATION_ID, buildNotification(message))
  }

  private fun startAsForegroundService() {
    val notification = buildNotification("Connecting to the watch sensor…")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      NOTIFICATION_CHANNEL,
      "Live heart rate",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Keeps watch heart-rate tracking active while Goon Quest Link is in the background."
      setShowBadge(false)
    }
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  private fun buildNotification(status: String): Notification {
    val stopIntent = Intent(this, HeartRateTrackingService::class.java).setAction(ACTION_STOP)
    val stopPendingIntent = PendingIntent.getService(
      this,
      STOP_PENDING_INTENT,
      stopIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, NOTIFICATION_CHANNEL)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    return builder
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setContentTitle("Goon Quest heart rate")
      .setContentText(status)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .addAction(
        Notification.Action.Builder(
          android.R.drawable.ic_media_pause,
          "Stop",
          stopPendingIntent,
        ).build(),
      )
      .build()
  }

  override fun onDestroy() {
    if (cpuLock?.isHeld == true) cpuLock?.release()
    val wasUnexpectedlyStopped = trackingRequested
    handler.removeCallbacksAndMessages(null)
    disconnectSensor()
    if (wasUnexpectedlyStopped) {
      HeartRateTrackingState.active = false
      HeartRateTrackingState.status = "Tracking stopped by the system. Open Goon Quest Link to resume."
      sendBroadcast(
        Intent(ACTION_STATE)
          .setPackage(packageName)
          .putExtra(EXTRA_STATUS, HeartRateTrackingState.status)
          .putExtra(EXTRA_ACTIVE, false),
      )
    }
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  companion object {
    const val ACTION_START = "com.mochi.quadvideoplayer.wear.action.START_HEART_RATE"
    const val ACTION_STOP = "com.mochi.quadvideoplayer.wear.action.STOP_HEART_RATE"
    const val ACTION_STATE = "com.mochi.quadvideoplayer.wear.action.HEART_RATE_STATE"
    const val EXTRA_STATUS = "status"
    const val EXTRA_ACTIVE = "active"

    private const val HEART_RATE_PATH = "/qvp/hr"
    private const val REQUESTED_PREFS = "goon_quest_watch_hr"
    private const val PREF_TRACKING_REQUESTED = "tracking_requested"
    private const val NOTIFICATION_CHANNEL = "goon-quest-live-heart-rate"
    private const val NOTIFICATION_ID = 8401
    private const val STOP_PENDING_INTENT = 8402
    private const val MIN_BPM = 20
    private const val MAX_BPM = 240
    private const val WATCHDOG_INTERVAL_MS = 30_000L
    private const val READING_TIMEOUT_MS = 75_000L
    private const val NOTIFICATION_REFRESH_MS = 10_000L
    private const val INITIAL_RECONNECT_DELAY_MS = 2_000L
    private const val MAX_RECONNECT_DELAY_MS = 60_000L
    private const val MAX_RECONNECT_ATTEMPTS = 6
  }
}
