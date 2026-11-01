package com.mochi.quadvideoplayer.downloads

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.util.Size
import java.io.File
import java.security.MessageDigest

/** Bounded disk cache; at most one frame extraction runs at a time. */
internal object VideoPreviewStore {
  @Synchronized
  fun get(context: Context, source: String): String {
    val folder = File(context.cacheDir, "pool-previews").apply { mkdirs() }
    val key = MessageDigest.getInstance("SHA-256").digest(source.toByteArray())
      .joinToString("") { "%02x".format(it) }
    val output = File(folder, "$key.jpg")
    if (output.exists() && output.length() > 0) {
      output.setLastModified(System.currentTimeMillis())
      return Uri.fromFile(output).toString()
    }
    val uri = Uri.parse(source)
    val bitmap = if (Build.VERSION.SDK_INT >= 29 && uri.scheme == "content") {
      try {
        context.contentResolver.loadThumbnail(uri, Size(192, 108), null)
      } catch (_: Exception) {
        extract(context, uri)
      }
    } else extract(context, uri)
    try {
      output.outputStream().use {
        check(bitmap.compress(Bitmap.CompressFormat.JPEG, 80, it)) { "Could not save video preview." }
      }
    } catch (error: Exception) {
      output.delete()
      throw error
    } finally {
      bitmap.recycle()
    }
    var bytes = folder.listFiles()?.sumOf { it.length() } ?: 0L
    folder.listFiles()?.sortedBy { it.lastModified() }?.forEach {
      if (bytes > 32L * 1024 * 1024 && it != output) {
        val size = it.length()
        if (it.delete()) bytes -= size
      }
    }
    return Uri.fromFile(output).toString()
  }

  private fun extract(context: Context, uri: Uri): Bitmap {
    check(Build.VERSION.SDK_INT >= 27) { "Video previews require Android 8.1 or newer." }
    val retriever = MediaMetadataRetriever()
    try {
      retriever.setDataSource(context, uri)
      return retriever.getScaledFrameAtTime(
        1_000_000, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, 192, 108
      ) ?: retriever.getScaledFrameAtTime(
        0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, 192, 108
      ) ?: throw IllegalStateException("This video has no available preview frame.")
    } finally {
      retriever.release()
    }
  }
}
