# React Native & Hermes
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# OkHttp (React Native networking)
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }

# Vision Camera
-keep class com.mrousavy.camera.** { *; }

# Keep native modules
-keep class com.mtmobileapp.** { *; }

# Keep React Native classes
-keep class com.facebook.react.** { *; }
-dontwarn com.facebook.react.**
