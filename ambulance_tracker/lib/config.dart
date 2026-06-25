import 'package:shared_preferences/shared_preferences.dart';

/// The backend this app always talks to. The driver never types or scans a
/// server address — it's baked in here so the app just works on install.
///
/// NOTE: use the host machine's LAN IP (not 127.0.0.1 — that resolves to the
/// phone/emulator itself). The backend must be served on 0.0.0.0 so devices on
/// the same network can reach it (e.g. `uvicorn app.main:app --host 0.0.0.0`).
const String kBackendBaseUrl = 'http://10.110.9.42:8000';

/// Persisted driver session: the ambulance login token obtained at sign-in, the
/// ambulance's plate (for display), and how often to stream a GPS position
/// during a journey. The server address is fixed ([kBackendBaseUrl]).
class Config {
  Config({
    required this.token,
    this.plate = '',
    this.intervalSeconds = 15,
  });

  /// The fixed backend address — always [kBackendBaseUrl].
  String get baseUrl => kBackendBaseUrl;

  final String token;
  final String plate;
  final int intervalSeconds;

  bool get isLoggedIn => token.isNotEmpty;

  static const _kToken = 'driver_token';
  static const _kPlate = 'plate';
  static const _kInterval = 'interval_seconds';

  static Future<Config> load() async {
    final prefs = await SharedPreferences.getInstance();
    return Config(
      token: prefs.getString(_kToken) ?? '',
      plate: prefs.getString(_kPlate) ?? '',
      intervalSeconds: prefs.getInt(_kInterval) ?? 15,
    );
  }

  Future<void> save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kToken, token);
    await prefs.setString(_kPlate, plate);
    await prefs.setInt(_kInterval, intervalSeconds);
  }

  static Future<void> clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kToken);
    await prefs.remove(_kPlate);
  }

  Config copyWith({String? token, String? plate, int? intervalSeconds}) => Config(
        token: token ?? this.token,
        plate: plate ?? this.plate,
        intervalSeconds: intervalSeconds ?? this.intervalSeconds,
      );
}
