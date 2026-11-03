package com.mtmobileapp

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

/** Deliberately no FieldLocation or background tracking bootstrap. FieldPush (2026-11-03): server notifications only. */
class AttendanceApplication : Application(), ReactApplication {
    override val reactHost: ReactHost by lazy {
        getDefaultReactHost(context = applicationContext, packageList = PackageList(this).packages.apply {
            add(object : ReactPackage {
                override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
                    listOf(FieldNetworkModule(context), FieldAppearanceModule(context), FieldPushModule(context), AttendanceIdentity(context))
                override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
            })
        })
    }
    override fun onCreate() {
        super.onCreate()
        FieldHttp.install(this)
        // A push that arrives while the app is closed is drawn by the system
        // into this channel; it must exist before the first one.
        FieldNotificationReceiver.ensureChannel(this, FieldNotificationReceiver.DEFAULT_CHANNEL)
        // HR's explanation requests and decisions come in this one (owner,
        // 2026-11-03: the default channel only showed an icon in the status bar).
        FieldNotificationReceiver.ensureTeamMessagesChannel(this)
        loadReactNative(this)
    }
}

/** Installed identity comes from the APK, never an employee preference. */
class AttendanceIdentity(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName(): String = "AttendanceIdentity"
    override fun getConstants(): MutableMap<String, Any> = mutableMapOf(
        "applicationId" to BuildConfig.APPLICATION_ID,
        "apkVersion" to "${BuildConfig.VERSION_NAME}+${BuildConfig.VERSION_CODE}"
    )
}
