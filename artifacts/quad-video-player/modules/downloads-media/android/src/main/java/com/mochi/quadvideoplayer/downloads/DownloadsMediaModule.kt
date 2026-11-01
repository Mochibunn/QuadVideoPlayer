package com.mochi.quadvideoplayer.downloads

import android.Manifest
import android.content.ContentUris
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import android.app.PictureInPictureParams
import android.util.Rational
import androidx.fragment.app.FragmentActivity

class DownloadsMediaModule : Module() {
  private val filePicker = FileManagerPicker()

  override fun definition() = ModuleDefinition {
    Name("DownloadsMedia")
    Events("pipChanged", "pipClosed")
    OnCreate {
      appContext.reactContext?.let { CrashReports.install(it) }
    }
    AsyncFunction("getCrashReport") {
      appContext.reactContext?.let { CrashReports.read(it) }
    }

    AsyncFunction("inspectSessionMedia") { uris: List<String>, retain: Boolean ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("The Android application is not available.")
      SessionMediaAccess.inspect(context, uris, retain)
    }

    AsyncFunction("enterQuadPip") {
      val activity = appContext.throwingActivity as? FragmentActivity
        ?: throw IllegalStateException("The Android activity is unavailable.")
      check(Build.VERSION.SDK_INT >= 26 &&
        activity.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
        "This Android device does not support picture-in-picture."
      }
      val tag = "quad-picture-in-picture"
      if (activity.supportFragmentManager.findFragmentByTag(tag) == null) {
        val observer = QuadPipFragment().apply {
          onChange = { active -> sendEvent("pipChanged", mapOf("active" to active)) }
          onClosed = { sendEvent("pipClosed", emptyMap<String, Any>()) }
        }
        activity.supportFragmentManager.beginTransaction().add(observer, tag).commitNow()
      }
      val params = PictureInPictureParams.Builder().setAspectRatio(Rational(8, 5)).build()
      check(activity.enterPictureInPictureMode(params)) {
        "Android did not allow picture-in-picture. Enable it for Quad Video Player in Android Settings."
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("pickFiles") { samsung: Boolean, promise: Promise ->
      filePicker.launch(appContext.throwingActivity, samsung, promise)
    }.runOnQueue(Queues.MAIN)

    OnActivityResult { _, (requestCode, resultCode, data) ->
      appContext.reactContext?.let { filePicker.onResult(it, requestCode, resultCode, data) }
    }

    AsyncFunction("getVideoPreview") { uri: String ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("The Android application is not available.")
      VideoPreviewStore.get(context, uri)
    }

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
