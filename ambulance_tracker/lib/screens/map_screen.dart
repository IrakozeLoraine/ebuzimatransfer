import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

import '../config.dart';
import '../driver_api.dart';
import '../theme.dart';

/// A live navigation map for the active journey, in the style of a fleet app:
/// the ambulance's current position, the sending and receiving facilities, and the
/// driving route between them (free OpenStreetMap tiles + OSRM routing — no API key).
class MapScreen extends StatefulWidget {
  const MapScreen({super.key, required this.journey, required this.config});

  final Journey journey;
  final Config config;

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  final _map = MapController();
  final _api = DriverApi();
  StreamSubscription<Position>? _posSub;
  LatLng? _me;
  List<LatLng> _route = const [];
  final List<LatLng> _trail = [];
  bool _follow = true;

  static const _distance = Distance();

  LatLng? get _from {
    final s = widget.journey.sending;
    return (s?.latitude != null && s?.longitude != null) ? LatLng(s!.latitude!, s.longitude!) : null;
  }

  LatLng? get _to {
    final r = widget.journey.receiving;
    return (r?.latitude != null && r?.longitude != null) ? LatLng(r!.latitude!, r.longitude!) : null;
  }

  @override
  void initState() {
    super.initState();
    _seedTrail();
    _startTracking();
    _loadRoute();
  }

  /// Seed the trail from the server's recorded fixes for this journey, so the whole
  /// path shows straight away (persisting across reopening the map) and matches the
  /// web view. Live GPS fixes then extend it from wherever it left off.
  Future<void> _seedTrail() async {
    final recorded = await _api.journeyPings(
      baseUrl: widget.config.baseUrl,
      token: widget.config.token,
    );
    if (!mounted || recorded.isEmpty) return;
    final seeded = recorded.map((p) => LatLng(p.latitude, p.longitude)).toList();
    setState(() {
      // Prepend the recorded history before any live fixes captured while it loaded.
      _trail.insertAll(0, seeded);
    });
  }

  Future<void> _startTracking() async {
    try {
      _posSub = Geolocator.getPositionStream(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 2),
      ).listen((pos) {
        final me = LatLng(pos.latitude, pos.longitude);
        if (!mounted) return;
        setState(() {
          _me = me;
          if (_trail.isEmpty || _distance.as(LengthUnit.Meter, _trail.last, me) >= 2) {
            _trail.add(me);
          }
        });
        if (_follow) _map.move(me, _map.camera.zoom);
      });
    } catch (_) {/* permission handled elsewhere; map still shows the route */}
  }

  /// Fetch the driving route. Origin is the ambulance (or the sending facility until a
  /// GPS fix), destination is the receiving facility. Falls back to a straight line.
  Future<void> _loadRoute() async {
    final origin = _me ?? _from;
    final dest = _to;
    if (origin == null || dest == null) return;
    try {
      final url = Uri.parse(
        'https://router.project-osrm.org/route/v1/driving/'
        '${origin.longitude},${origin.latitude};${dest.longitude},${dest.latitude}'
        '?overview=full&geometries=geojson',
      );
      final resp = await http.get(url).timeout(const Duration(seconds: 12));
      if (resp.statusCode == 200) {
        final routes = (jsonDecode(resp.body)['routes'] as List?) ?? const [];
        final coords = routes.isNotEmpty ? (routes[0]['geometry']['coordinates'] as List) : const [];
        final pts = coords.map((c) => LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble())).toList();
        if (mounted && pts.isNotEmpty) setState(() => _route = pts);
        return;
      }
    } catch (_) {/* fall through to straight line */}
    if (mounted) setState(() => _route = [origin, dest]);
  }

  @override
  void dispose() {
    _posSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final center = _me ?? _from ?? _to ?? const LatLng(-1.9441, 30.0619); // Kigali fallback
    final markers = <Marker>[
      if (_from != null) _pin(_from!, Icons.local_hospital, AppColors.mutedForeground),
      if (_to != null) _pin(_to!, Icons.flag, AppColors.success),
      if (_me != null)
        Marker(
          point: _me!,
          width: 44,
          height: 44,
          child: const Icon(Icons.navigation, color: AppColors.primary, size: 32),
        ),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text('Navigate · ${widget.journey.receiving?.name ?? 'Destination'}'),
        actions: [
          IconButton(
            tooltip: _follow ? 'Following' : 'Follow me',
            icon: Icon(_follow ? Icons.my_location : Icons.location_searching),
            onPressed: () {
              setState(() => _follow = !_follow);
              if (_follow && _me != null) _map.move(_me!, 15);
            },
          ),
        ],
      ),
      body: Stack(
        children: [
          FlutterMap(
            mapController: _map,
            options: MapOptions(
              initialCenter: center,
              initialZoom: 13,
              onPointerDown: (_, __) {
                if (_follow) setState(() => _follow = false); // stop following on manual pan
              },
            ),
            children: [
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.ebuzima.ambulance',
              ),
              PolylineLayer(
                polylines: [
                  // Suggested driving route (faint), under the actual driven path.
                  if (_route.isNotEmpty)
                    Polyline(
                      points: _route,
                      strokeWidth: 4,
                      color: AppColors.mutedForeground.withValues(alpha: 0.45),
                    ),
                  // The path actually driven — bold, on top.
                  if (_trail.length >= 2)
                    Polyline(points: _trail, strokeWidth: 6, color: AppColors.primary),
                ],
              ),
              MarkerLayer(markers: markers),
              const RichAttributionWidget(
                attributions: [TextSourceAttribution('© OpenStreetMap contributors')],
              ),
            ],
          ),
          Positioned(left: 12, bottom: 12, child: _legend()),
        ],
      ),
    );
  }

  Widget _legend() {
    Widget row(Color color, String label) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(width: 18, height: 3, color: color),
            const SizedBox(width: 6),
            Text(label, style: const TextStyle(fontSize: 12, color: AppColors.foreground)),
          ],
        );
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.background.withValues(alpha: 0.9),
        borderRadius: BorderRadius.circular(8),
        boxShadow: const [BoxShadow(color: Color(0x22000000), blurRadius: 6)],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          row(AppColors.primary, 'Your path'),
          const SizedBox(height: 4),
          row(AppColors.mutedForeground.withValues(alpha: 0.45), 'Suggested route'),
        ],
      ),
    );
  }

  Marker _pin(LatLng p, IconData icon, Color color) {
    return Marker(
      point: p,
      width: 40,
      height: 40,
      child: Icon(icon, color: color, size: 32),
    );
  }
}
