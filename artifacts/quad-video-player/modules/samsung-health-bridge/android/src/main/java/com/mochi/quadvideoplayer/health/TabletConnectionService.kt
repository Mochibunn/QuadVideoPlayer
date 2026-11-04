package com.mochi.quadvideoplayer.health

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.bluetooth.BluetoothAdapter
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper

/** Own the tablet connection outside the Activity/JS lifecycle and retry link loss. */
class TabletConnectionService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  @Volatile private var address: String? = null
  private lateinit var power: BackgroundPowerLock
  private val worker = java.util.concurrent.Executors.newSingleThreadExecutor()
  private val connecting = java.util.concurrent.atomic.AtomicBoolean(false)
  private val reconnect = object : Runnable {
    override fun run() {
      val target = address ?: return
      val state = TabletBluetoothClient.state()
      if (state["connected"] != true && connecting.compareAndSet(false, true)) {
        worker.execute {
          try {
            BluetoothAdapter.getDefaultAdapter()?.let { TabletBluetoothClient.connect(it, target) }
          } catch (_: Exception) { /* Retried while the user-requested service is active. */ }
          finally {
            if (address != null && address != target) TabletBluetoothClient.disconnect()
            connecting.set(false)
          }
        }
      }
      handler.postDelayed(this, 10_000)
    }
  }
  override fun onCreate() {
    super.onCreate()
    power = BackgroundPowerLock(this, "GoonQuest:TabletHR")
    getSystemService(NotificationManager::class.java).createNotificationChannel(
      NotificationChannel("gq-tablet-hr", "Live watch connection", NotificationManager.IMPORTANCE_LOW))
    val notification = Notification.Builder(this, "gq-tablet-hr")
      .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
      .setContentTitle("Goon Quest live heart rate")
      .setContentText("Keeping the phone connection active. Disconnect in Heart rate settings to stop.")
      .setOngoing(true).build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
      startForeground(8302, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
    else startForeground(8302, notification)
    power.start()
  }
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val prefs = getSharedPreferences("gq-tablet-hr", MODE_PRIVATE)
    val requested = intent?.getStringExtra("address") ?: prefs.getString("address", null)
    if (requested != address) TabletBluetoothClient.disconnect()
    address = requested
    if (address == null) { stopSelf(); return START_NOT_STICKY }
    prefs.edit().putString("address", address).apply()
    handler.removeCallbacks(reconnect)
    reconnect.run()
    return START_STICKY
  }
  override fun onDestroy() {
    address = null
    handler.removeCallbacks(reconnect)
    power.stop()
    TabletBluetoothClient.disconnect()
    worker.shutdownNow()
    super.onDestroy()
  }
  override fun onBind(intent: Intent?): IBinder? = null
}
