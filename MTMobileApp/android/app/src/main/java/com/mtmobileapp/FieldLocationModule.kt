package com.mtmobileapp

import android.Manifest
import android.content.pm.PackageManager
import android.location.Location
import android.os.Looper
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

/**
 * A stream of positions from Google's fused provider, pushed to JS as events.
 *
 * Owner's drive, 2026-09-22: the track had 15-minute holes with six kilometres
 * between two points. JS asked for a position on its own clock, and a
 * backgrounded app's clock stops; the community geolocation module watches one
 * system provider at a time — the network one indoors, so a car produced
 * 100–200 m points, rarely. The fused provider does the sampling in the OS and
 * delivers to a background app through this module, which the JS side only
 * uploads (src/services/location.android.ts).
 *
 * Deliberately not the library's own fused path: its listener crashes the app
 * natively on 3.4.0 (see BUG-1 in src/services/location.ts).
 */
class FieldLocationModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "FieldLocation"

  /**
   * How often the OS should deliver a position while tracking a shift.
   *
   * Half the 30 s send gap: 2026-09-26 the owner's phone sent a point every
   * 42 s with 20 s readings — 20 s is not due, 40 s is. Two 15 s readings make
   * one 30 s point.
   */
  private val intervalMs = 15_000L

  /** Bursts are welcome: a moving phone gets a fresher fix, the JS throttles uploads. */
  private val fastestIntervalMs = 5_000L

  private val client: FusedLocationProviderClient by lazy {
    LocationServices.getFusedLocationProviderClient(reactContext)
  }

  private var callback: LocationCallback? = null

  private fun hasPermission(): Boolean =
    ContextCompat.checkSelfPermission(reactContext, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
      ContextCompat.checkSelfPermission(reactContext, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

  private fun toMap(location: Location): WritableMap {
    val map = Arguments.createMap()
    map.putDouble("latitude", location.latitude)
    map.putDouble("longitude", location.longitude)
    map.putDouble("timestamp", location.time.toDouble())
    if (location.hasAccuracy()) map.putDouble("accuracy", location.accuracy.toDouble()) else map.putNull("accuracy")
    if (location.hasSpeed()) map.putDouble("speed", location.speed.toDouble()) else map.putNull("speed")
    if (location.hasBearing()) map.putDouble("heading", location.bearing.toDouble()) else map.putNull("heading")
    if (location.hasAltitude()) map.putDouble("altitude", location.altitude) else map.putNull("altitude")
    map.putBoolean("isMoving", location.hasSpeed() && location.speed > 1.0f)
    return map
  }

  private fun emit(location: Location) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_NAME, toMap(location))
  }

  /** Starts the stream. Resolves false when the app may not read location yet. */
  @ReactMethod
  fun start(promise: Promise) {
    if (!hasPermission()) {
      promise.resolve(false)
      return
    }
    if (callback != null) {
      promise.resolve(true)
      return
    }
    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs)
      .setMinUpdateIntervalMillis(fastestIntervalMs)
      .setMinUpdateDistanceMeters(0f)
      .setWaitForAccurateLocation(false)
      .build()
    val listener = object : LocationCallback() {
      override fun onLocationResult(result: LocationResult) {
        result.lastLocation?.let(::emit)
      }
    }
    try {
      client.requestLocationUpdates(request, listener, Looper.getMainLooper())
    } catch (error: SecurityException) {
      promise.resolve(false)
      return
    }
    callback = listener
    promise.resolve(true)
  }

  @ReactMethod
  fun stop(promise: Promise) {
    callback?.let(client::removeLocationUpdates)
    callback = null
    promise.resolve(true)
  }

  /** Required by NativeEventEmitter; the stream itself needs no bookkeeping. */
  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  companion object {
    const val EVENT_NAME = "FieldLocationUpdate"
  }
}
