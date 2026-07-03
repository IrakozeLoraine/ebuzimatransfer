import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

import '../driver_api.dart';
import '../theme.dart';

/// A live navigation map for the active journey, in the style of a fleet app:
/// the ambulance's current position, the sending and receiving facilities, and the
/// driving route between them (free OpenStreetMap tiles + OSRM routing — no API key).
class MapScreen extends StatefulWidget {
  const MapScreen({super.key, required this.journey});

  final Journey journey;

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  final _map = MapController();
  StreamSubscription<Position>? _posSub;
  LatLng? _me;
  List<LatLng> _route = const [];
  bool _follow = true;

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
    _startTracking();
    _loadRoute();
  }

  Future<void> _startTracking() async {
    try {
      _posSub = Geolocator.getPositionStream(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 10),
      ).listen((pos) {
        final me = LatLng(pos.latitude, pos.longitude);
        if (!mounted) return;
        setState(() => _me = me);
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
      body: FlutterMap(
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
          if (_route.isNotEmpty)
            PolylineLayer(
              polylines: [Polyline(points: _route, strokeWidth: 5, color: AppColors.primary)],
            ),
          MarkerLayer(markers: markers),
          const RichAttributionWidget(
            attributions: [TextSourceAttribution('© OpenStreetMap contributors')],
          ),
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
