package com.mochi.quadvideoplayer.downloads

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import java.io.File
import java.util.Date

internal object CrashReports {
  private var installed = false
  @Synchronized fun install(context: Context) {
    if (installed) return
    installed = true
    val app = context.applicationContext
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, error ->
      try {
        File(app.filesDir, "last-playback-crash.txt").writeText(
          "Quad Video Player · ${Date()}\n${Build.MANUFACTURER} ${Build.MODEL} · Android ${Build.VERSION.RELEASE}\nThread: ${thread.name}\n\n${error.stackTraceToString().take(24000)}"
        )
        app.getSharedPreferences("crash-reports", Context.MODE_PRIVATE).edit().putBoolean("unread", true).commit()
      } catch (_: Throwable) { /* Never interrupt Android's real crash handling. */ }
      previous?.uncaughtException(thread, error)
    }
  }

  fun read(context: Context): Map<String, Any>? {
    val prefs = context.getSharedPreferences("crash-reports", Context.MODE_PRIVATE)
    val file = File(context.filesDir, "last-playback-crash.txt")
    if (file.exists()) {
      val unread = prefs.getBoolean("unread", false)
      prefs.edit().putBoolean("unread", false).apply()
      return mapOf("text" to file.readText().take(24000), "isNew" to unread)
    }
    if (Build.VERSION.SDK_INT < 30) return null
    val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    val exit = manager.getHistoricalProcessExitReasons(context.packageName, 0, 8).firstOrNull {
      it.reason in listOf(ApplicationExitInfo.REASON_CRASH, ApplicationExitInfo.REASON_CRASH_NATIVE,
        ApplicationExitInfo.REASON_ANR, ApplicationExitInfo.REASON_LOW_MEMORY)
    } ?: return null
    val lastSeen = prefs.getLong("last-exit-seen", 0)
    val trace = try {
      exit.traceInputStream?.bufferedReader()?.use {
        val buffer = CharArray(24000)
        val length = it.read(buffer)
        if (length > 0) String(buffer, 0, length) else null
      }
    } catch (_: Exception) { null }
    val reason = when (exit.reason) {
      ApplicationExitInfo.REASON_CRASH -> "Java/React Native crash"
      ApplicationExitInfo.REASON_CRASH_NATIVE -> "Native crash"
      ApplicationExitInfo.REASON_ANR -> "Application not responding"
      else -> "Android low-memory termination"
    }
    val report = "Quad Video Player · Android exit report\n${Date(exit.timestamp)}\n${Build.MANUFACTURER} ${Build.MODEL} · Android ${Build.VERSION.RELEASE}\nReason: $reason\n${exit.description ?: ""}\n\n${trace ?: "Android did not provide a stack trace for this exit."}"
    prefs.edit().putLong("last-exit-seen", exit.timestamp).apply()
    return mapOf("text" to report, "isNew" to (exit.timestamp > lastSeen))
  }
}
