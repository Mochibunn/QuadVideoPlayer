package com.mochi.quadvideoplayer.downloads

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import java.nio.ByteOrder
import kotlin.math.sqrt

internal object AudioBpmAnalyzer {
  private const val ENVELOPE_RATE = 50
  private const val MAX_ANALYSIS_SECONDS = 24
  private const val MAX_DECODE_MILLIS = 25_000L
  private const val DEQUEUE_TIMEOUT_US = 10_000L

  fun analyze(context: Context, mediaUri: String): Map<String, Any> {
    val extractor = MediaExtractor()
    var codec: MediaCodec? = null
    try {
      setSource(extractor, context, mediaUri)
      var audioTrack = -1
      var audioFormat: MediaFormat? = null
      for (index in 0 until extractor.trackCount) {
        val candidate = extractor.getTrackFormat(index)
        if (candidate.getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true) {
          audioTrack = index
          audioFormat = candidate
          break
        }
      }
      val format = audioFormat
        ?: throw IllegalArgumentException("This video has no audio track to analyze.")
      extractor.selectTrack(audioTrack)
      val mime = format.getString(MediaFormat.KEY_MIME)
        ?: throw IllegalArgumentException("The video audio format is unavailable.")
      codec = MediaCodec.createDecoderByType(mime)
      codec.configure(format, null, null, 0)
      codec.start()

      val envelope = ArrayList<Double>(MAX_ANALYSIS_SECONDS * ENVELOPE_RATE)
      val info = MediaCodec.BufferInfo()
      val startTime = System.nanoTime()
      val durationUs = MAX_ANALYSIS_SECONDS * 1_000_000L
      var inputEnded = false
      var outputEnded = false
      var lastPresentationTimeUs = 0L
      var sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      var pcmEncoding = AudioFormat.ENCODING_PCM_16BIT
      var framesPerWindow = (sampleRate / ENVELOPE_RATE).coerceAtLeast(1)
      var framesInWindow = 0
      var windowEnergy = 0.0

      while (!outputEnded &&
        envelope.size < MAX_ANALYSIS_SECONDS * ENVELOPE_RATE &&
        (System.nanoTime() - startTime) / 1_000_000L < MAX_DECODE_MILLIS
      ) {
        if (!inputEnded) {
          val inputIndex = codec.dequeueInputBuffer(DEQUEUE_TIMEOUT_US)
          if (inputIndex >= 0) {
            val input = codec.getInputBuffer(inputIndex)
              ?: throw IllegalStateException("The video audio decoder did not provide an input buffer.")
            input.clear()
            val size = extractor.readSampleData(input, 0)
            val presentationTimeUs = extractor.sampleTime
            if (size < 0 || presentationTimeUs >= durationUs) {
              codec.queueInputBuffer(
                inputIndex, 0, 0, lastPresentationTimeUs,
                MediaCodec.BUFFER_FLAG_END_OF_STREAM
              )
              inputEnded = true
            } else {
              lastPresentationTimeUs = presentationTimeUs.coerceAtLeast(0)
              codec.queueInputBuffer(inputIndex, 0, size, lastPresentationTimeUs, 0)
              extractor.advance()
            }
          }
        }

        val outputIndex = codec.dequeueOutputBuffer(info, DEQUEUE_TIMEOUT_US)
        when {
          outputIndex >= 0 -> {
            if (info.size > 0) {
              val output = codec.getOutputBuffer(outputIndex)
              if (output != null) {
                output.position(info.offset)
                output.limit(info.offset + info.size)
                output.order(ByteOrder.LITTLE_ENDIAN)
                val bytesPerSample = when (pcmEncoding) {
                  AudioFormat.ENCODING_PCM_FLOAT -> 4
                  AudioFormat.ENCODING_PCM_8BIT -> 1
                  else -> 2
                }
                val frameBytes = bytesPerSample * channels.coerceAtLeast(1)
                while (output.remaining() >= frameBytes &&
                  envelope.size < MAX_ANALYSIS_SECONDS * ENVELOPE_RATE
                ) {
                  var mono = 0.0
                  repeat(channels.coerceAtLeast(1)) {
                    mono += when (pcmEncoding) {
                      AudioFormat.ENCODING_PCM_FLOAT -> output.float.toDouble()
                      AudioFormat.ENCODING_PCM_8BIT -> ((output.get().toInt() and 0xff) - 128) / 128.0
                      else -> output.short.toDouble() / 32768.0
                    }
                  }
                  val average = mono / channels.coerceAtLeast(1)
                  windowEnergy += average * average
                  framesInWindow += 1
                  if (framesInWindow >= framesPerWindow) {
                    envelope.add(sqrt(windowEnergy / framesInWindow))
                    framesInWindow = 0
                    windowEnergy = 0.0
                  }
                }
              }
            }
            val reachedEnd = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
            codec.releaseOutputBuffer(outputIndex, false)
            if (reachedEnd) outputEnded = true
          }
          outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            val decoded = codec.outputFormat
            if (decoded.containsKey(MediaFormat.KEY_SAMPLE_RATE)) {
              sampleRate = decoded.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            }
            if (decoded.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) {
              channels = decoded.getInteger(MediaFormat.KEY_CHANNEL_COUNT).coerceAtLeast(1)
            }
            if (decoded.containsKey(MediaFormat.KEY_PCM_ENCODING)) {
              pcmEncoding = decoded.getInteger(MediaFormat.KEY_PCM_ENCODING)
            }
            framesPerWindow = (sampleRate / ENVELOPE_RATE).coerceAtLeast(1)
          }
        }
      }

      if (envelope.size < 400) {
        throw IllegalArgumentException("The audio track is too short or could not be decoded.")
      }
      return mapOf(
        "envelope" to envelope,
        "sampleRate" to ENVELOPE_RATE,
        "analyzedSeconds" to envelope.size.toDouble() / ENVELOPE_RATE
      )
    } catch (error: IllegalArgumentException) {
      throw error
    } catch (error: Exception) {
      throw IllegalStateException(
        "Could not analyze this video's audio. Check that the file is accessible and uses a supported audio codec.",
        error
      )
    } finally {
      try {
        codec?.stop()
      } catch (_: Exception) {
        // A decoder that failed during setup may not be in the started state.
      }
      codec?.release()
      extractor.release()
    }
  }

  private fun setSource(extractor: MediaExtractor, context: Context, source: String) {
    val uri = Uri.parse(source)
    when (uri.scheme?.lowercase()) {
      "content" -> extractor.setDataSource(context, uri, null)
      "file" -> extractor.setDataSource(uri.path ?: throw IllegalArgumentException("The video file path is invalid."))
      "https" -> {
        if (uri.host.isNullOrBlank() || !uri.userInfo.isNullOrEmpty()) {
          throw IllegalArgumentException("The video URL is invalid.")
        }
        extractor.setDataSource(source)
      }
      else -> throw IllegalArgumentException("BPM detection supports local files and HTTPS video streams.")
    }
  }
}
