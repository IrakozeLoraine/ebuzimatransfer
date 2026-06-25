import 'package:flutter/material.dart';

import 'config.dart';
import 'theme.dart';
import 'screens/login_screen.dart';
import 'screens/journey_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const AmbulanceDriverApp());
}

class AmbulanceDriverApp extends StatelessWidget {
  const AmbulanceDriverApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ambulance Driver',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      home: const _Root(),
    );
  }
}

/// Decides where to start: the sign-in screen until the driver has a session,
/// otherwise the journey screen.
class _Root extends StatefulWidget {
  const _Root();

  @override
  State<_Root> createState() => _RootState();
}

class _RootState extends State<_Root> {
  Config? _config;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  /// Load the saved session, holding the splash for a brief minimum so it
  /// doesn't flicker on fast starts.
  Future<void> _boot() async {
    final results = await Future.wait([
      Config.load(),
      Future<void>.delayed(const Duration(milliseconds: 1500)),
    ]);
    if (mounted) setState(() => _config = results.first as Config);
  }

  @override
  Widget build(BuildContext context) {
    final config = _config;
    if (config == null) {
      return const SplashScreen();
    }
    if (!config.isLoggedIn) {
      return LoginScreen(
        initial: config,
        onSignedIn: (c) => setState(() => _config = c),
      );
    }
    return JourneyScreen(
      config: config,
      onSignOut: () async {
        final fresh = await Config.load();
        if (mounted) setState(() => _config = fresh);
      },
    );
  }
}
