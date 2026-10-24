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

/** Deliberately no FieldLocation, FieldPush or background tracking bootstrap. */
class AttendanceApplication : Application(), ReactApplication {
    override val reactHost: ReactHost by lazy {
        getDefaultReactHost(context = applicationContext, packageList = PackageList(this).packages.apply {
            add(object : ReactPackage {
                override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
                    listOf(FieldNetworkModule(context), FieldAppearanceModule(context), AttendanceIdentity(context))
                override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
            })
        })
    }
    override fun onCreate() {
        super.onCreate()
        FieldHttp.install(this)
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
