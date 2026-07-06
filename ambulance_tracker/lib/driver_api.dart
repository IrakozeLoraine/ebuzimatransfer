import 'dart:convert';
import 'package:http/http.dart' as http;

/// A facility/town endpoint on the journey (sending or receiving hospital).
class JourneyPoint {
  JourneyPoint({required this.name, this.latitude, this.longitude});
  final String name;
  final double? latitude;
  final double? longitude;

  static JourneyPoint? fromJson(Map<String, dynamic>? j) {
    if (j == null) return null;
    return JourneyPoint(
      name: j['name'] as String? ?? '',
      latitude: (j['latitude'] as num?)?.toDouble(),
      longitude: (j['longitude'] as num?)?.toDouble(),
    );
  }
}

/// The one journey currently assigned to the signed-in ambulance.
class Journey {
  Journey({
    required this.transportId,
    required this.referralId,
    required this.referralNumber,
    required this.step,
    this.sending,
    this.receiving,
    this.dispatchTime,
    this.pickupTime,
    this.arrivalTime,
  });

  final String transportId;
  final String referralId;
  final String referralNumber;

  /// ASSIGNED -> EN_ROUTE_TO_PICKUP -> PATIENT_ONBOARD -> ARRIVED
  final String step;
  final JourneyPoint? sending;
  final JourneyPoint? receiving;
  final DateTime? dispatchTime;
  final DateTime? pickupTime;
  final DateTime? arrivalTime;

  /// True while the ambulance is moving and should be streaming its position.
  bool get isTracking => step == 'EN_ROUTE_TO_PICKUP' || step == 'PATIENT_ONBOARD';

  /// A finished trip — used to list past journeys in the history view.
  bool get isComplete => arrivalTime != null;

  static DateTime? _parseTime(dynamic v) =>
      v is String && v.isNotEmpty ? DateTime.tryParse(v)?.toLocal() : null;

  static Journey fromJson(Map<String, dynamic> j) => Journey(
        transportId: j['transport_id'] as String,
        referralId: j['referral_id'] as String? ?? '',
        referralNumber: j['referral_number'] as String? ?? '',
        step: j['step'] as String? ?? 'ASSIGNED',
        sending: JourneyPoint.fromJson(j['sending'] as Map<String, dynamic>?),
        receiving: JourneyPoint.fromJson(j['receiving'] as Map<String, dynamic>?),
        dispatchTime: _parseTime(j['dispatch_time']),
        pickupTime: _parseTime(j['pickup_time']),
        arrivalTime: _parseTime(j['arrival_time']),
      );
}

class ApiException implements Exception {
  ApiException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Outcome of uploading a voice-recorded Patient Monitoring Transfer Form.
class MonitoringResult {
  MonitoringResult({
    required this.summary,
    required this.vitalsCount,
    required this.problemsCount,
  });

  final String summary;
  final int vitalsCount;
  final int problemsCount;

  static MonitoringResult fromJson(Map<String, dynamic> j) => MonitoringResult(
        summary: j['summary'] as String? ?? '',
        vitalsCount: (j['vital_signs'] as List<dynamic>?)?.length ?? 0,
        problemsCount: (j['problems'] as List<dynamic>?)?.length ?? 0,
      );
}

/// Talks to the backend's driver endpoints. The ambulance authenticates with the
/// bearer token returned by [login]; there are no hardware keys.
class DriverApi {
  DriverApi({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  Uri _uri(String baseUrl, String path) {
    var base = baseUrl.trim();
    while (base.endsWith('/')) {
      base = base.substring(0, base.length - 1);
    }
    if (!base.endsWith('/api/v1')) {
      base = '$base/api/v1';
    }
    return Uri.parse('$base$path');
  }

  Map<String, String> _authHeaders(String token) => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      };

  /// Pull a human-readable error out of a backend response body. The API returns
  /// errors as ``{"detail": {"message": "...", ...}}`` (or a plain ``detail`` string).
  String _errorMessage(http.Response resp, String fallback) {
    try {
      final body = jsonDecode(resp.body);
      final detail = body is Map ? body['detail'] : null;
      if (detail is Map && detail['message'] is String) return detail['message'] as String;
      if (detail is String && detail.isNotEmpty) return detail;
    } catch (_) {/* not JSON — use the fallback */}
    return fallback;
  }

  /// Signs in with the ambulance login set by the facility. Returns
  /// `(token, plate)`.
  Future<({String token, String plate})> login({
    required String baseUrl,
    required String loginId,
    required String password,
  }) async {
    final resp = await _client
        .post(
          _uri(baseUrl, '/driver/login'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({'login_id': loginId, 'password': password}),
        )
        .timeout(const Duration(seconds: 20));
    if (resp.statusCode == 200) {
      final body = jsonDecode(resp.body) as Map<String, dynamic>;
      final ambulance = body['ambulance'] as Map<String, dynamic>?;
      return (
        token: body['token'] as String,
        plate: ambulance?['plate_number'] as String? ?? '',
      );
    }
    if (resp.statusCode == 401) {
      throw ApiException(_errorMessage(resp, 'Wrong login ID or password, or the ambulance is disabled.'));
    }
    throw ApiException(_errorMessage(resp, 'Sign-in failed (${resp.statusCode}).'));
  }

  /// The current journey, or null when none is assigned.
  Future<Journey?> journey({required String baseUrl, required String token}) async {
    final resp = await _client
        .get(_uri(baseUrl, '/driver/journey'), headers: _authHeaders(token))
        .timeout(const Duration(seconds: 20));
    if (resp.statusCode == 401) throw ApiException('Session expired. Sign in again.');
    if (resp.statusCode != 200) throw ApiException('Could not load journey (${resp.statusCode}).');
    final body = resp.body.trim();
    if (body.isEmpty || body == 'null') return null;
    return Journey.fromJson(jsonDecode(body) as Map<String, dynamic>);
  }

  /// This ambulance's completed journeys, most recent first.
  Future<List<Journey>> journeys({required String baseUrl, required String token}) async {
    final resp = await _client
        .get(_uri(baseUrl, '/driver/journeys'), headers: _authHeaders(token))
        .timeout(const Duration(seconds: 20));
    if (resp.statusCode == 401) throw ApiException('Session expired. Sign in again.');
    if (resp.statusCode != 200) throw ApiException('Could not load journey history (${resp.statusCode}).');
    final body = resp.body.trim();
    if (body.isEmpty || body == 'null') return const [];
    final list = jsonDecode(body) as List<dynamic>;
    return list.map((e) => Journey.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Journey> _advance(String baseUrl, String token, String path) async {
    final resp = await _client
        .post(_uri(baseUrl, path), headers: _authHeaders(token))
        .timeout(const Duration(seconds: 20));
    if (resp.statusCode == 200) {
      return Journey.fromJson(jsonDecode(resp.body) as Map<String, dynamic>);
    }
    if (resp.statusCode == 401) throw ApiException('Session expired. Sign in again.');
    String detail = 'Could not update the journey (${resp.statusCode}).';
    try {
      final body = jsonDecode(resp.body);
      final d = body is Map ? body['detail'] : null;
      if (d is Map && d['message'] is String) {
        detail = d['message'] as String;
      } else if (d is String) {
        detail = d;
      }
    } catch (_) {}
    throw ApiException(detail);
  }

  Future<Journey> start(String baseUrl, String token) =>
      _advance(baseUrl, token, '/driver/journey/start');

  Future<Journey> picked(String baseUrl, String token) =>
      _advance(baseUrl, token, '/driver/journey/picked');

  Future<Journey> arrived(String baseUrl, String token) =>
      _advance(baseUrl, token, '/driver/journey/arrived');

  /// Uploads a voice recording of the Patient Monitoring Transfer Form for the
  /// active journey. The backend transcribes it, extracts the vitals/problem log,
  /// and stores it on the referral for the clinics and admins to read on the web.
  Future<MonitoringResult> recordMonitoring({
    required String baseUrl,
    required String token,
    required String filePath,
  }) async {
    final req = http.MultipartRequest('POST', _uri(baseUrl, '/driver/journey/monitoring'))
      ..headers['Authorization'] = 'Bearer $token'
      ..files.add(await http.MultipartFile.fromPath('audio', filePath, filename: 'monitoring.m4a'));
    final streamed = await req.send().timeout(const Duration(seconds: 180));
    final resp = await http.Response.fromStream(streamed);
    if (resp.statusCode == 200) {
      return MonitoringResult.fromJson(jsonDecode(resp.body) as Map<String, dynamic>);
    }
    if (resp.statusCode == 401) throw ApiException('Session expired. Sign in again.');
    if (resp.statusCode == 404) throw ApiException('No active journey to attach monitoring to.');
    String detail = 'Could not save the recording (${resp.statusCode}).';
    try {
      final body = jsonDecode(resp.body);
      final d = body is Map ? body['detail'] : null;
      if (d is Map && d['message'] is String) {
        detail = d['message'] as String;
      } else if (d is String) {
        detail = d;
      }
    } catch (_) {}
    throw ApiException(detail);
  }

  Future<List<({double latitude, double longitude})>> journeyPings({
    required String baseUrl,
    required String token,
  }) async {
    try {
      final resp = await _client
          .get(_uri(baseUrl, '/driver/journey/pings'), headers: _authHeaders(token))
          .timeout(const Duration(seconds: 20));
      if (resp.statusCode != 200) return const [];
      final body = resp.body.trim();
      if (body.isEmpty || body == 'null') return const [];
      final list = jsonDecode(body) as List<dynamic>;
      return list
          .map((e) => (
                latitude: (e['latitude'] as num).toDouble(),
                longitude: (e['longitude'] as num).toDouble(),
              ))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// Streams a single GPS fix for the active journey. Returns true on success;
  /// failures are swallowed so a dropped fix doesn't interrupt the trip.
  Future<bool> ping({
    required String baseUrl,
    required String token,
    required double latitude,
    required double longitude,
  }) async {
    try {
      final resp = await _client
          .post(
            _uri(baseUrl, '/driver/journey/ping'),
            headers: _authHeaders(token),
            body: jsonEncode({'latitude': latitude, 'longitude': longitude}),
          )
          .timeout(const Duration(seconds: 20));
      return resp.statusCode == 201;
    } catch (_) {
      return false;
    }
  }

  // ── In-app calling ────────────────────────────────────────────────────────────────

  /// Place a call to a clinic for a referral. ``side`` is "receiving" or "referring".
  /// Returns the new call id.
  Future<String> startCall({
    required String baseUrl,
    required String token,
    required String referralId,
    String side = 'receiving',
  }) async {
    final resp = await _client
        .post(
          _uri(baseUrl, '/driver/calls'),
          headers: _authHeaders(token),
          body: jsonEncode({'referral_id': referralId, 'side': side}),
        )
        .timeout(const Duration(seconds: 20));
    if (resp.statusCode == 201) {
      return (jsonDecode(resp.body) as Map<String, dynamic>)['id'] as String;
    }
    String msg = 'Could not start the call (${resp.statusCode}).';
    try {
      final d = jsonDecode(resp.body)['detail'];
      if (d is Map && d['message'] is String) msg = d['message'] as String;
    } catch (_) {}
    throw ApiException(msg);
  }

  Future<void> answerCall({required String baseUrl, required String token, required String callId}) =>
      _callAction(baseUrl, token, '/driver/calls/$callId/answer');

  Future<void> endCall({required String baseUrl, required String token, required String callId}) =>
      _callAction(baseUrl, token, '/driver/calls/$callId/end');

  Future<void> _callAction(String baseUrl, String token, String path) async {
    await _client
        .post(_uri(baseUrl, path), headers: _authHeaders(token))
        .timeout(const Duration(seconds: 20));
  }

  /// Relay a WebRTC signaling message (offer/answer/ice) to the other party.
  Future<void> sendSignal({
    required String baseUrl,
    required String token,
    required String callId,
    required String kind,
    required Object data,
  }) async {
    await _client
        .post(
          _uri(baseUrl, '/driver/calls/$callId/signal'),
          headers: _authHeaders(token),
          body: jsonEncode({'kind': kind, 'data': data}),
        )
        .timeout(const Duration(seconds: 20));
  }
}
