package com.mochi.quadvideoplayer.downloads

import android.Manifest
import android.content.ContentUris
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DownloadsMediaModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DownloadsMedia")

    AsyncFunction("getVideos") {
      val context = appContext.reactContext
        ?: throw IllegalStateException("The Android application is not available.")
      val fullPermission = if (Build.VERSION.SDK_INT >= 33)
        Manifest.permission.READ_MEDIA_VIDEO else Manifest.permission.READ_EXTERNAL_STORAGE
      val full = context.checkSelfPermission(fullPermission) == PackageManager.PERMISSION_GRANTED
      val limited = Build.VERSION.SDK_INT >= 34 &&
        context.checkSelfPermission(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED) ==
          PackageManager.PERMISSION_GRANTED
      if (!full && !limited) throw SecurityException("Video library access is required to read Downloads.")

      @Suppress("DEPRECATION")
      val legacyRoot = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS).absolutePath
      val spec = DownloadsQuery.forSdk(Build.VERSION.SDK_INT, legacyRoot)
      val collections = if (Build.VERSION.SDK_INT >= 29) {
        MediaStore.getExternalVolumeNames(context).map { MediaStore.Video.Media.getContentUri(it) }
      } else {
        listOf(MediaStore.Video.Media.EXTERNAL_CONTENT_URI)
      }
      val projection = arrayOf(
        MediaStore.Video.Media._ID,
        MediaStore.Video.Media.DISPLAY_NAME,
        MediaStore.Video.Media.MIME_TYPE
      )
      val videos = mutableListOf<Map<String, String?>>()
      for (collection in collections) {
        val cursor = context.contentResolver.query(
          collection, projection, spec.selection, spec.arguments,
          "${MediaStore.Video.Media.DISPLAY_NAME} ASC, ${MediaStore.Video.Media._ID} ASC"
        ) ?: throw IllegalStateException("Android could not open the Downloads video library.")
        cursor.use {
          val idColumn = it.getColumnIndexOrThrow(MediaStore.Video.Media._ID)
          val nameColumn = it.getColumnIndexOrThrow(MediaStore.Video.Media.DISPLAY_NAME)
          val mimeColumn = it.getColumnIndexOrThrow(MediaStore.Video.Media.MIME_TYPE)
          while (it.moveToNext()) {
            val id = it.getLong(idColumn)
            videos.add(mapOf(
              "name" to (it.getString(nameColumn) ?: "Video $id"),
              "uri" to ContentUris.withAppendedId(collection, id).toString(),
              "mimeType" to it.getString(mimeColumn)
            ))
          }
        }
      }
      videos
    }
  }
}
