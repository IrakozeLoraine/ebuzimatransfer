import 'package:flutter/material.dart';

import 'config.dart';
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
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: const Color(0xFFdc2626),
        brightness: Brightness.light,
      ),
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
    Config.load().then((c) {
      if (mounted) setState(() => _config = c);
    });
  }

  @override
  Widget build(BuildContext context) {
    final config = _config;
    if (config == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
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
