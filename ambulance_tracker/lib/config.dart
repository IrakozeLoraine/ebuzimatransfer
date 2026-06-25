import 'package:shared_preferences/shared_preferences.dart';

/// Persisted driver session: where the backend lives, the ambulance login token
/// obtained at sign-in, the ambulance's plate (for display), and how often to
/// stream a GPS position during a journey.
class Config {
  Config({
    required this.baseUrl,
    required this.token,
    this.plate = '',
    this.intervalSeconds = 15,
  });

  final String baseUrl;
  final String token;
  final String plate;
  final int intervalSeconds;

  bool get isLoggedIn => baseUrl.isNotEmpty && token.isNotEmpty;

  static const _kBaseUrl = 'base_url';
  static const _kToken = 'driver_token';
  static const _kPlate = 'plate';
  static const _kInterval = 'interval_seconds';

  static Future<Config> load() async {
    final prefs = await SharedPreferences.getInstance();
    return Config(
      baseUrl: prefs.getString(_kBaseUrl) ?? '',
      token: prefs.getString(_kToken) ?? '',
      plate: prefs.getString(_kPlate) ?? '',
      intervalSeconds: prefs.getInt(_kInterval) ?? 15,
    );
  }

  Future<void> save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kBaseUrl, baseUrl);
    await prefs.setString(_kToken, token);
    await prefs.setString(_kPlate, plate);
    await prefs.setInt(_kInterval, intervalSeconds);
  }

  static Future<void> clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    // Keep the server address for the next sign-in; drop the token.
    await prefs.remove(_kToken);
    await prefs.remove(_kPlate);
  }

  Config copyWith({String? baseUrl, String? token, String? plate, int? intervalSeconds}) =>
      Config(
        baseUrl: baseUrl ?? this.baseUrl,
        token: token ?? this.token,
        plate: plate ?? this.plate,
        intervalSeconds: intervalSeconds ?? this.intervalSeconds,
      );
}
