package com.mtmobileapp

import android.os.Bundle
import android.os.Build
import android.content.res.Configuration
import android.graphics.Color
import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.LifecycleEventListener
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
    updateAttendanceSystemNavigation(resources.configuration)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    if (BuildConfig.APPLICATION_ID != "com.leaddrive.attendance") return
    updateAttendanceSystemNavigation(newConfig)
    // RN 0.84 refreshes native text layout on a font change, but DeviceInfo
    // caches the JS fontScale until host resume. Refresh only that listener:
    // the Activity and the open React form must remain mounted.
    val context = (application as ReactApplication).reactHost?.currentReactContext
    (context?.getNativeModule("DeviceInfo") as? LifecycleEventListener)?.onHostResume()
  }

  @Suppress("DEPRECATION") // navigationBarColor is needed on pre-edge-to-edge Android.
  private fun updateAttendanceSystemNavigation(config: Configuration) {
    if (BuildConfig.APPLICATION_ID != "com.leaddrive.attendance") return
    val dark = config.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
    // Matches TimeUI.surface; the padded area behind Android's navigation
    // buttons otherwise keeps the colour from Activity creation.
    window.decorView.setBackgroundColor(Color.parseColor(if (dark) "#18251F" else "#FCFDFB"))
    window.navigationBarColor = Color.TRANSPARENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isNavigationBarContrastEnforced = false
    }
    WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightNavigationBars = !dark
  }

  /**
   * The app is not built edge-to-edge (`edgeToEdgeEnabled=false`), but Android
   * 16 enforces edge-to-edge for apps targeting SDK 36 and ignores the opt-out.
   * The window then runs under the system navigation bar. Measured on the
   * owner's Samsung S23 Ultra (Android 16, three-button navigation,
   * 2026-09-13): navigation bar at y 2181–2316 over the bottom 135 px of the
   * app, under a translucent scrim, so a tap there lands on Back, Home or
   * Recents. (The tab bar itself was also collapsed on that build — a separate
   * defect, fixed in `theme/tabBarMetrics.ts`.)
   *
   * Screens were written for a window that stops above that bar — the sign-in
   * button, bottom sheets, the visit flow's footer — and only the tab bar reads
   * a bottom inset. So the boundary is restored here rather than on every
   * screen: the content view stops where the navigation bar starts, as a
   * non-edge-to-edge app did before Android 15. The insets are passed on
   * unconsumed; safe-area-context measures what still overlaps the view, which
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
