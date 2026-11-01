package com.mochi.quadvideoplayer.downloads

import android.os.Bundle
import androidx.fragment.app.Fragment

/** Observe the activity window, retaining all four VideoViews inside it. */
class QuadPipFragment : Fragment() {
  var onChange: ((Boolean) -> Unit)? = null
  var onClosed: (() -> Unit)? = null
  private var wasPip = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (onChange == null) {
      parentFragmentManager.beginTransaction().remove(this).commitAllowingStateLoss()
    }
  }

  override fun onPictureInPictureModeChanged(inPip: Boolean) {
    super.onPictureInPictureModeChanged(inPip)
    if (inPip) wasPip = true
    onChange?.invoke(inPip)
  }

  override fun onResume() {
    super.onResume()
    if (activity?.isInPictureInPictureMode != true) wasPip = false
  }

  override fun onStop() {
    super.onStop()
    if (wasPip) {
      onClosed?.invoke()
      wasPip = false
    }
  }
}
