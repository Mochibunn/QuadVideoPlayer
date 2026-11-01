package com.mochi.quadvideoplayer.downloads

/** Bound parameters keep the scan limited to Downloads, including descendants. */
internal object DownloadsQuery {
  data class Spec(val selection: String, val arguments: Array<String>)

  fun forSdk(api: Int, legacyRoot: String): Spec {
    if (api >= 29) {
      return Spec(
        "relative_path LIKE ? OR relative_path LIKE ?",
        arrayOf("Download/%", "Downloads/%")
      )
    }
    val escapedRoot = legacyRoot.trimEnd('/')
      .replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return Spec("_data LIKE ? ESCAPE '\\'", arrayOf("$escapedRoot/%"))
  }
}
