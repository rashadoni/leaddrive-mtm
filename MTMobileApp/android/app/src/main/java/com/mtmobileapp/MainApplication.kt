package com.mtmobileapp

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here.
          add(PresentationFilesPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    FieldHttp.install(this)
    // Before Firebase draws a team message that arrived while the app was closed:
    // a push naming a channel that does not exist falls back to the default one.
    FieldNotificationReceiver.ensureTeamMessagesChannel(this)
    loadReactNative(this)
  }
}
