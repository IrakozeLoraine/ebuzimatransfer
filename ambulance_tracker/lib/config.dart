import 'package:shared_preferences/shared_preferences.dart';

const String kBackendBaseUrl = 'https://ebuzimatransfer.duckdns.org';

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
