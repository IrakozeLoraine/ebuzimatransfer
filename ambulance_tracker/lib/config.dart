import 'package:shared_preferences/shared_preferences.dart';

// Production server. Use this for real devices / deployed builds.
// const String kBackendBaseUrl = 'http://ebuzimatransfer.duckdns.org';
// Local backend during development:
//   - Android emulator: 10.0.2.2 maps to the host machine's localhost.
//   - iOS simulator:    use 127.0.0.1.
//   - Physical phone:   use your computer's LAN IP, e.g. http://192.168.x.x:8000
const String kBackendBaseUrl = 'http://10.0.2.2:8000';

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
