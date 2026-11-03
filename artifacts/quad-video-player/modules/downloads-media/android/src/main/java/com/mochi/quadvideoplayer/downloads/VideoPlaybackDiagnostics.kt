package com.mochi.quadvideoplayer.downloads

import android.content.Context
import android.media.MediaCodecList
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import java.io.FileNotFoundException

/** Reads track headers only; never allocates another video decoder during playback. */
internal object VideoPlaybackDiagnostics {
  fun inspect(context: Context, source: String): String {
    val uri = Uri.parse(source)
    if (uri.scheme != "content" && uri.scheme != "file") {
      return "Track inspection is available for local files only. Review the native playback error below."
    }
    val extractor = MediaExtractor()
    return try {
      context.contentResolver.openAssetFileDescriptor(uri, "r")?.use { }
        ?: return "File could not be opened. Select it again in the file manager."
      extractor.setDataSource(context, uri, null)
      val codecs = MediaCodecList(MediaCodecList.REGULAR_CODECS)
      val tracks = (0 until minOf(extractor.trackCount, 8)).map { index ->
        val format = extractor.getTrackFormat(index)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: "unknown"
        val dimensions = if (format.containsKey(MediaFormat.KEY_WIDTH) && format.containsKey(MediaFormat.KEY_HEIGHT))
          " · ${format.getInteger(MediaFormat.KEY_WIDTH)}×${format.getInteger(MediaFormat.KEY_HEIGHT)}" else ""
        val profile = if (format.containsKey(MediaFormat.KEY_PROFILE))
          " · profile ${format.getInteger(MediaFormat.KEY_PROFILE)}" else ""
        val decoder = try { codecs.findDecoderForFormat(format) } catch (_: Exception) { null }
        "Track ${index + 1}: $mime$dimensions$profile\nAndroid decoder: ${decoder ?: "none advertised for this format"}"
      }
      "File access: readable\n${tracks.joinToString("\n\n").ifBlank { "No media tracks found." }}\n\n" +
        "A listed decoder does not guarantee support for every sample or enough resources for four simultaneous videos. " +
        "MX Player may use its own software codecs; this app uses Android's decoders."
    } catch (_: SecurityException) {
      "File access denied. Select this file again in the file manager to renew access."
    } catch (_: FileNotFoundException) {
      "File not found or no longer available. Select it again in the file manager."
    } catch (error: Exception) {
      "Could not read media track headers: ${error.javaClass.simpleName}: ${error.message.orEmpty().take(400)}"
    } finally {
      extractor.release()
    }
  }
}
