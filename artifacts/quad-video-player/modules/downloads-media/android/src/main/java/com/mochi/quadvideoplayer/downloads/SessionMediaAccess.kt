package com.mochi.quadvideoplayer.downloads

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build

internal object SessionMediaAccess {
  fun inspect(context: Context, sources: List<String>, retain: Boolean): List<Map<String, Any>> {
    val resolver = context.contentResolver
    return sources.distinct().map { source ->
      val uri = Uri.parse(source)
      if (uri.scheme != "content" && uri.scheme != "file")
        throw IllegalArgumentException("Only local media can be restored from a session.")
      val readable = try {
        resolver.openAssetFileDescriptor(uri, "r")?.use { true } ?: false
      } catch (_: Exception) { false }
      if (readable && retain && uri.scheme == "content") {
        try {
          resolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } catch (_: SecurityException) {
          // GET_CONTENT providers may only offer temporary grants. Report this.
        }
      }
      val grant = resolver.persistedUriPermissions.any {
        it.isReadPermission && (source == it.uri.toString() ||
          source.startsWith(it.uri.toString().trimEnd('/') + "/"))
      }
      val mediaPermission = when {
        Build.VERSION.SDK_INT >= 34 ->
          context.checkSelfPermission(Manifest.permission.READ_MEDIA_VIDEO) == PackageManager.PERMISSION_GRANTED ||
            context.checkSelfPermission(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED) == PackageManager.PERMISSION_GRANTED
        Build.VERSION.SDK_INT >= 33 ->
          context.checkSelfPermission(Manifest.permission.READ_MEDIA_VIDEO) == PackageManager.PERMISSION_GRANTED
        else -> context.checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
      }
      mapOf("uri" to source, "readable" to readable, "persistent" to
        (readable && (grant || uri.scheme == "file" ||
          (uri.authority == "media" && uri.pathSegments.contains("video") && mediaPermission))))
    }
  }
}
