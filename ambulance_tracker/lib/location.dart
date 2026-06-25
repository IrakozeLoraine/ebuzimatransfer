import 'package:geolocator/geolocator.dart';

class LocationException implements Exception {
  LocationException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Ensures location services + permission are available, throwing a
/// [LocationException] with a human-readable reason if not.
Future<void> ensureLocationReady() async {
  if (!await Geolocator.isLocationServiceEnabled()) {
    throw LocationException('Location services are turned off on this device.');
  }

  var permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) {
    permission = await Geolocator.requestPermission();
  }
  if (permission == LocationPermission.denied) {
    throw LocationException('Location permission was denied.');
  }
  if (permission == LocationPermission.deniedForever) {
    throw LocationException(
        'Location permission is permanently denied. Enable it in Settings.');
  }
}

/// Reads the current high-accuracy position.
Future<Position> currentPosition() {
  return Geolocator.getCurrentPosition(
    locationSettings: const LocationSettings(
      accuracy: LocationAccuracy.high,
      timeLimit: Duration(seconds: 15),
    ),
  );
}
