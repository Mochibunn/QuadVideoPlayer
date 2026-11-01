package com.mochi.quadvideoplayer.downloads

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import expo.modules.kotlin.Promise

internal class FileManagerPicker {
  private var pending: Promise? = null

  fun launch(activity: Activity, samsung: Boolean, promise: Promise) {
    check(pending == null) { "A file selection is already open." }
    val request = Intent(Intent.ACTION_GET_CONTENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      // Some providers classify MOV/MKV files as binary, so filter after selection.
      type = "*/*"
      putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      if (samsung) setPackage("com.sec.android.app.myfiles")
    }
    pending = promise
    try {
      activity.startActivityForResult(
        if (samsung) request else Intent.createChooser(request, "Select a file manager"),
        REQUEST_CODE
      )
    } catch (error: Exception) {
      pending = null
      promise.reject(
        "ERR_FILE_MANAGER",
        if (samsung) "Samsung My Files is not installed or cannot handle file selection on this device. Choose another app or use the system picker."
        else "No installed app could open file selection. Use the system picker.",
        error
      )
    }
  }

  fun onResult(context: Context, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQUEST_CODE) return
    val promise = pending ?: return
    pending = null
    if (resultCode != Activity.RESULT_OK) {
      promise.resolve(mapOf("canceled" to true, "assets" to emptyList<Any>()))
      return
    }
    try {
      val uris = linkedSetOf<Uri>()
      data?.clipData?.let { clip ->
        for (index in 0 until clip.itemCount) uris.add(clip.getItemAt(index).uri)
      }
      data?.data?.let { uris.add(it) }
      check(uris.isNotEmpty()) { "The file manager returned no readable files." }
      val resolver = context.contentResolver
      val assets = uris.map { uri ->
        var name: String? = null
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
          if (it.moveToFirst()) name = it.getString(0)
        }
        // Retain a durable grant if offered. GET_CONTENT providers may only
        // grant session access; never imply that those survive a device restart.
        if ((data!!.flags and Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION) != 0) {
          try {
            resolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
          } catch (_: SecurityException) {
            // Temporary read access remains valid for the current selection.
          }
        }
        mapOf(
          "uri" to uri.toString(),
          "name" to (name ?: uri.lastPathSegment ?: "Selected file"),
          "mimeType" to resolver.getType(uri)
        )
      }
      promise.resolve(mapOf("canceled" to false, "assets" to assets))
    } catch (error: Exception) {
      promise.reject("ERR_FILE_MANAGER_RESULT", "Could not read the selected files: ${error.message}", error)
    }
  }

  companion object {
    private const val REQUEST_CODE = 49126
  }
}
