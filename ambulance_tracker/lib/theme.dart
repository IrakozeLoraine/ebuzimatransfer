import 'package:flutter/material.dart';

/// Design tokens mirrored from the web app (`frontend/src/index.css`) so the
/// driver app reads as the same product. The colours are the web's HSL CSS
/// variables converted to hex; radii match `--radius` (0.625rem) and the
/// `rounded-xl` cards.
class AppColors {
  AppColors._();

  static const primary = Color(0xFF068ECE); // --primary            199 94% 42%
  static const primaryForeground = Color(0xFFFFFFFF);
  static const background = Color(0xFFF8FAFB); // --background       210 20% 98%
  static const foreground = Color(0xFF171C26); // --foreground      220 25% 12%
  static const card = Color(0xFFFFFFFF); // --card
  static const border = Color(0xFFDAE0E6); // --border / --input    210 20% 88%
  static const muted = Color(0xFFEDF0F3); // --muted                210 20% 94%
  static const mutedForeground = Color(0xFF6C7C93); // --muted-fg   215 15% 50%
  static const destructive = Color(0xFFEF4444); // --destructive    0 84% 60%
  static const success = Color(0xFF16A34A); // green-600 (live / arrived)
}

/// `--radius` (0.625rem ≈ 10px) and the web's `rounded-xl` card radius.
const double kRadius = 10;
const double kRadiusXl = 14;

ThemeData buildAppTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: AppColors.primary,
    brightness: Brightness.light,
  ).copyWith(
    primary: AppColors.primary,
    onPrimary: AppColors.primaryForeground,
    surface: AppColors.card,
    onSurface: AppColors.foreground,
    error: AppColors.destructive,
    onError: Colors.white,
    outline: AppColors.mutedForeground,
    outlineVariant: AppColors.border,
  );

  OutlineInputBorder fieldBorder(Color color, [double width = 1]) =>
      OutlineInputBorder(
        borderRadius: BorderRadius.circular(kRadius),
        borderSide: BorderSide(color: color, width: width),
      );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: AppColors.background,
    // Inter to match the web; falls back to the platform font if not bundled.
    fontFamily: 'Inter',
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.card,
      foregroundColor: AppColors.foreground,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: AppColors.foreground,
        fontSize: 18,
        fontWeight: FontWeight.w600,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.card,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: fieldBorder(AppColors.border),
      enabledBorder: fieldBorder(AppColors.border),
      focusedBorder: fieldBorder(AppColors.primary, 1.5),
      errorBorder: fieldBorder(AppColors.destructive),
      focusedErrorBorder: fieldBorder(AppColors.destructive, 1.5),
      labelStyle: const TextStyle(color: AppColors.mutedForeground),
      floatingLabelStyle: const TextStyle(color: AppColors.primary),
      hintStyle: TextStyle(color: AppColors.mutedForeground.withValues(alpha: 0.7)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.primaryForeground,
        disabledBackgroundColor: AppColors.primary.withValues(alpha: 0.5),
        disabledForegroundColor: Colors.white,
        elevation: 0,
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(kRadius),
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.foreground,
        side: const BorderSide(color: AppColors.border),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(kRadius),
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: AppColors.primary),
    ),
    dividerTheme: const DividerThemeData(
      color: AppColors.border,
      thickness: 1,
      space: 1,
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: AppColors.foreground,
      contentTextStyle: const TextStyle(color: Colors.white),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(kRadius),
      ),
    ),
    textTheme: const TextTheme().apply(
      bodyColor: AppColors.foreground,
      displayColor: AppColors.foreground,
    ),
  );
}

/// A white, lightly-bordered surface matching the web's `rounded-xl` Card.
class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.child, this.padding});

  final Widget child;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding ?? const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(kRadiusXl),
        border: Border.all(color: AppColors.border),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0F101828), // subtle, like the web's shadow-card
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: child,
    );
  }
}

/// The eBuzima Transfer logo (Rwanda coat of arms), mirrored from the web app's
/// `ebuzimaTransfer.svg`. Bundled as a PNG so no SVG renderer is needed.
class BrandLogo extends StatelessWidget {
  const BrandLogo({super.key, this.size = 60});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/logo.png',
      width: size,
      height: size,
      filterQuality: FilterQuality.medium,
    );
  }
}

/// The product lockup used on the web login: the logo + wordmark.
class BrandHeader extends StatelessWidget {
  const BrandHeader({super.key, this.center = false});

  final bool center;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: center ? MainAxisSize.min : MainAxisSize.max,
      children: const [
        BrandLogo(size: 52),
        SizedBox(width: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Ministry of Health',
              style: TextStyle(
                fontSize: 13,
                color: AppColors.mutedForeground,
                fontWeight: FontWeight.w500,
              ),
            ),
            Text(
              'E-Buzima Transfer',
              style: TextStyle(
                fontSize: 18,
                color: AppColors.foreground,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Branded splash shown while the app loads the saved session, mirroring the
/// web's centered logo + wordmark on the app background.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: AppColors.background,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            BrandLogo(size: 120),
            SizedBox(height: 20),
            Text(
              'Ministry of Health',
              style: TextStyle(
                fontSize: 14,
                color: AppColors.mutedForeground,
                fontWeight: FontWeight.w500,
              ),
            ),
            SizedBox(height: 2),
            Text(
              'E-Buzima Transfer',
              style: TextStyle(
                fontSize: 22,
                color: AppColors.foreground,
                fontWeight: FontWeight.w700,
              ),
            ),
            SizedBox(height: 36),
            SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                color: AppColors.primary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
