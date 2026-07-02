# Keep WebView methods
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep our app classes
-keep class com.graphenepa.app.** { *; }

# Remove logging
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}

# Keep AndroidX classes
-keep class androidx.** { *; }
