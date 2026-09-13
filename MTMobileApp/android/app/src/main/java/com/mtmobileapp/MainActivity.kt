package com.mtmobileapp

import android.os.Bundle
import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * React Native Screens fragments must be recreated by React Navigation,
   * rather than restored by Android after rotation or process recreation.
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
    keepContentOutOfNavigationBar()
  }

  /**
   * The app is not built edge-to-edge (`edgeToEdgeEnabled=false`), but Android
   * 16 enforces edge-to-edge for apps targeting SDK 36 and ignores the opt-out.
   * The window then runs under the system navigation bar, and the tab bar was
   * drawn behind it. Measured on the owner's Samsung S23 Ultra (Android 16,
   * three-button navigation, 2026-09-13): navigation bar at y 2181–2316, tab
   * bar at 2159–2316, tab buttons squeezed to 28 px with zero-height captions,
   * and a tap on a tab icon landing on Back, Home or Recents.
   *
   * The bottom inset that reached JavaScript did not match the bar (106 px
   * against 135), so padding the tab bar from JS was not a fix. Instead the
   * content view stops where the navigation bar starts — the same boundary a
   * non-edge-to-edge app had before Android 15. The insets are passed on
   * unconsumed: safe-area-context measures what still overlaps the view, which
   * is now nothing at the bottom, so nothing is padded twice. The top is left
   * to JavaScript, where every header already adds the status bar inset.
   */
  private fun keepContentOutOfNavigationBar() {
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val navigationBar = insets.getInsets(WindowInsetsCompat.Type.navigationBars())
      view.setPadding(navigationBar.left, 0, navigationBar.right, navigationBar.bottom)
      insets
    }
    ViewCompat.requestApplyInsets(content)
  }

  override fun getMainComponentName(): String = "LeadDriveRouteField"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
