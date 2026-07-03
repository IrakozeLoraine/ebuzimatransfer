# ML Kit barcode scanning (used by mobile_scanner). The plugin's own consumer
# rules use single-`*` wildcards (e.g. `com.google.mlkit.*`) which do NOT match
# subpackages, so R8 renames/strips the real barcode classes in
# com.google.mlkit.vision.barcode.internal.* and they fail at scan time with an
# obfuscated NullPointerException. Keep the whole trees with `**`.
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_vision_barcode.** { *; }
-keep class com.google.android.libraries.barhopper.** { *; }
-keep class com.google.android.gms.vision.** { *; }
-dontwarn com.google.mlkit.**

# mobile_scanner plugin
-keep class dev.steenbakker.mobile_scanner.** { *; }
