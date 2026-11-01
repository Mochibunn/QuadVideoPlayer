package com.mochi.quadvideoplayer.downloads

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class DownloadsQueryTest {
  @Test fun android10UsesRelativePaths() {
    val spec = DownloadsQuery.forSdk(29, "/unused")
    assertEquals("relative_path LIKE ? OR relative_path LIKE ?", spec.selection)
    assertArrayEquals(arrayOf("Download/%", "Downloads/%"), spec.arguments)
  }

  @Test fun currentAndroidIncludesDownloadsSubfoldersWithoutMatchingSiblings() {
    val spec = DownloadsQuery.forSdk(37, "/unused")
    assertArrayEquals(arrayOf("Download/%", "Downloads/%"), spec.arguments)
    // The slash before % excludes Downloaded/, Download-other/, and similarly named folders.
    for (pattern in spec.arguments) assertEquals("/%", pattern.takeLast(2))
  }

  @Test fun olderAndroidUsesTheActualPublicDownloadsRoot() {
    val spec = DownloadsQuery.forSdk(28, "/storage/emulated/0/Download")
    assertEquals("_data LIKE ? ESCAPE '\\'", spec.selection)
    assertArrayEquals(arrayOf("/storage/emulated/0/Download/%"), spec.arguments)
  }

  @Test fun olderAndroidNormalizesTrailingSlashes() {
    val spec = DownloadsQuery.forSdk(26, "/storage/emulated/0/Download/")
    assertArrayEquals(arrayOf("/storage/emulated/0/Download/%"), spec.arguments)
  }

  @Test fun legacyMountNamesCannotBecomeWildcards() {
    val spec = DownloadsQuery.forSdk(28, "/storage/AB_CD/100%/Download")
    assertArrayEquals(arrayOf("/storage/AB\\_CD/100\\%/Download/%"), spec.arguments)
  }
}
