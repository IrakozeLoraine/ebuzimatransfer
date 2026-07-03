import 'dart:async';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../config.dart';
import '../call_controller.dart';
import '../driver_api.dart';
import '../location.dart';
import '../theme.dart';
import '../widgets/call_overlay.dart';
import 'history_screen.dart';
import 'map_screen.dart';

/// The driver's main screen. It shows the single journey assigned to this
/// ambulance (sending → receiving hospital) and one big button for the next
/// step: Start journey → Patient picked up → Patient arrived. While the journey
/// is underway the phone streams its GPS position automatically.
class JourneyScreen extends StatefulWidget {
  const JourneyScreen({super.key, required this.config, required this.onSignOut});

  final Config config;
  final VoidCallback onSignOut;

  @override
  State<JourneyScreen> createState() => _JourneyScreenState();
}

class _JourneyScreenState extends State<JourneyScreen> {
  final _api = DriverApi();

  Journey? _journey;
  bool _loading = true;
  bool _busy = false;
  String? _error;

  Timer? _pollTimer;
  Timer? _gpsTimer;
  bool _sendingGps = false;
  DateTime? _lastFixAt;

  // Voice recording of the Patient Monitoring Transfer Form.
  final _recorder = AudioRecorder();
  bool _recording = false;
  bool _monitoringBusy = false;

  // In-app voice calls with the clinics (driver app side).
  late final CallController _call;

  @override
  void initState() {
    super.initState();
    _call = CallController(baseUrl: widget.config.baseUrl, token: widget.config.token)..connect();
    _refresh();
    // Re-check for a newly assigned (or advanced) journey periodically.
    _pollTimer = Timer.periodic(const Duration(seconds: 12), (_) => _refresh(quiet: true));
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _gpsTimer?.cancel();
    _recorder.dispose();
    _call.dispose();
    WakelockPlus.disable();
    super.dispose();
  }

  /// Call a clinic for the current journey. ``side`` is "receiving" or "referring".
  Future<void> _callClinic(String side) async {
    final j = _journey;
    if (j == null || j.referralId.isEmpty) return;
    try {
      await _call.placeCall(j.referralId, side: side,
          label: side == 'referring' ? (j.sending?.name ?? 'Referring clinic') : (j.receiving?.name ?? 'Receiving clinic'));
    } catch (e) {
      if (mounted) _snack(e.toString());
    }
  }

  /// Start voice-recording the monitoring form. Asks for the mic permission first.
  Future<void> _startRecording() async {
    try {
      if (!await _recorder.hasPermission()) {
        _snack('Microphone permission is needed to record monitoring.');
        return;
      }
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}/monitoring_${DateTime.now().millisecondsSinceEpoch}.m4a';
      await _recorder.start(const RecordConfig(encoder: AudioEncoder.aacLc), path: path);
      if (mounted) setState(() => _recording = true);
    } catch (_) {
      _snack('Could not start recording.');
    }
  }

  /// Stop recording and upload it; the backend transcribes and stores it on the
  /// referral for the clinics and admins to read.
  Future<void> _stopRecordingAndUpload() async {
    String? path;
    try {
      path = await _recorder.stop();
    } catch (_) {
      // fall through to reset state below
    }
    if (!mounted) return;
    setState(() => _recording = false);
    if (path == null) {
      _snack('Nothing was recorded.');
      return;
    }
    setState(() => _monitoringBusy = true);
    try {
      final result = await _api.recordMonitoring(
        baseUrl: widget.config.baseUrl,
        token: widget.config.token,
        filePath: path,
      );
      _snack(
        'Monitoring saved — ${result.vitalsCount} vital reading(s), ${result.problemsCount} problem(s).',
      );
    } on ApiException catch (e) {
      if (e.message.contains('Session expired')) {
        await _signOut();
        return;
      }
      _snack(e.message);
    } catch (_) {
      _snack('Could not upload the recording. Try again.');
    } finally {
      if (mounted) setState(() => _monitoringBusy = false);
    }
  }

  Future<void> _refresh({bool quiet = false}) async {
    if (!quiet) setState(() => _loading = true);
    try {
      final j = await _api.journey(baseUrl: widget.config.baseUrl, token: widget.config.token);
      if (!mounted) return;
      setState(() {
        _journey = j;
        _error = null;
        _loading = false;
      });
      _syncGpsStreaming();
    } on ApiException catch (e) {
      if (!mounted) return;
      // An expired/invalid token sends the driver back to sign-in.
      if (e.message.contains('Session expired')) {
        await _signOut();
        return;
      }
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not reach the server.';
        _loading = false;
      });
    }
  }

  /// Start/stop the GPS stream so it runs exactly while a journey is underway.
  void _syncGpsStreaming() {
    final shouldStream = _journey?.isTracking ?? false;
    if (shouldStream && _gpsTimer == null) {
      WakelockPlus.enable();
      _sendOneFix(); // immediately
      _gpsTimer = Timer.periodic(
        Duration(seconds: widget.config.intervalSeconds),
        (_) => _sendOneFix(),
      );
    } else if (!shouldStream && _gpsTimer != null) {
      _gpsTimer?.cancel();
      _gpsTimer = null;
      WakelockPlus.disable();
    }
  }

  Future<void> _sendOneFix() async {
    if (_sendingGps) return;
    _sendingGps = true;
    try {
      await ensureLocationReady();
      final pos = await currentPosition();
      final ok = await _api.ping(
        baseUrl: widget.config.baseUrl,
        token: widget.config.token,
        latitude: pos.latitude,
        longitude: pos.longitude,
      );
      if (ok && mounted) setState(() => _lastFixAt = DateTime.now());
    } catch (_) {
      // A missed fix is fine — the next tick tries again.
    } finally {
      _sendingGps = false;
    }
  }

  Future<void> _advance(Future<Journey> Function() action) async {
    setState(() => _busy = true);
    try {
      final j = await action();
      if (!mounted) return;
      setState(() => _journey = j);
      _syncGpsStreaming();
    } on ApiException catch (e) {
      _snack(e.message);
    } catch (_) {
      _snack('Something went wrong. Try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _signOut() async {
    _gpsTimer?.cancel();
    WakelockPlus.disable();
    await Config.clearSession();
    widget.onSignOut();
  }

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.config.plate.isEmpty ? 'My journey' : widget.config.plate),
        actions: [
          if (_journey != null) ...[
            IconButton(
              icon: const Icon(Icons.map_outlined),
              tooltip: 'Navigate',
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => MapScreen(journey: _journey!)),
              ),
            ),
            PopupMenuButton<String>(
              icon: const Icon(Icons.call),
              tooltip: 'Call a clinic',
              onSelected: _callClinic,
              itemBuilder: (_) => [
                PopupMenuItem(
                  value: 'receiving',
                  child: Text('Call ${_journey?.receiving?.name ?? 'receiving clinic'}'),
                ),
                PopupMenuItem(
                  value: 'referring',
                  child: Text('Call ${_journey?.sending?.name ?? 'referring clinic'}'),
                ),
              ],
            ),
          ],
          IconButton(icon: const Icon(Icons.refresh), tooltip: 'Refresh', onPressed: _busy ? null : () => _refresh()),
          IconButton(
            icon: const Icon(Icons.history),
            tooltip: 'Journey history',
            onPressed: _busy
                ? null
                : () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => HistoryScreen(config: widget.config),
                      ),
                    ),
          ),
          IconButton(icon: const Icon(Icons.logout), tooltip: 'Sign out', onPressed: _busy ? null : _signOut),
        ],
      ),
      body: SafeArea(
        child: Stack(
          children: [
            _body(context),
            CallOverlay(controller: _call),
          ],
        ),
      ),
    );
  }

  Widget _body(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _message(context, Icons.cloud_off, _error!, retry: true);
    final j = _journey;
    if (j == null) {
      return _message(
        context,
        Icons.hourglass_empty,
        'No journey assigned yet.\nWaiting for a clinician to dispatch this ambulance.',
        retry: true,
      );
    }
    return _JourneyView(
      journey: j,
      busy: _busy,
      lastFixAt: _lastFixAt,
      recording: _recording,
      monitoringBusy: _monitoringBusy,
      onStart: () => _advance(() => _api.start(widget.config.baseUrl, widget.config.token)),
      onPicked: () => _advance(() => _api.picked(widget.config.baseUrl, widget.config.token)),
      onArrived: () => _advance(() => _api.arrived(widget.config.baseUrl, widget.config.token)),
      onToggleRecording: _recording ? _stopRecordingAndUpload : _startRecording,
    );
  }

  Widget _message(BuildContext context, IconData icon, String text, {bool retry = false}) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: const BoxDecoration(
                color: AppColors.muted,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 40, color: AppColors.mutedForeground),
            ),
            const SizedBox(height: 16),
            Text(
              text,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 16, color: AppColors.foreground),
            ),
            if (retry) ...[
              const SizedBox(height: 20),
              OutlinedButton.icon(
                onPressed: () => _refresh(),
                icon: const Icon(Icons.refresh),
                label: const Text('Check again'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _JourneyView extends StatelessWidget {
  const _JourneyView({
    required this.journey,
    required this.busy,
    required this.lastFixAt,
    required this.recording,
    required this.monitoringBusy,
    required this.onStart,
    required this.onPicked,
    required this.onArrived,
    required this.onToggleRecording,
  });

  final Journey journey;
  final bool busy;
  final DateTime? lastFixAt;
  final bool recording;
  final bool monitoringBusy;
  final VoidCallback onStart;
  final VoidCallback onPicked;
  final VoidCallback onArrived;
  final VoidCallback onToggleRecording;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Text(
                'Transfer ',
                style: TextStyle(
                  fontSize: 16,
                  color: AppColors.mutedForeground,
                ),
              ),
              Text(
                journey.referralNumber,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.foreground,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _RouteCard(
            from: journey.sending?.name ?? 'Sending facility',
            to: journey.receiving?.name ?? 'Receiving facility',
          ),
          const SizedBox(height: 20),
          _Steps(step: journey.step),
          if (journey.isTracking) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.success.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.gps_fixed, size: 16, color: AppColors.success),
                  const SizedBox(width: 6),
                  Text(
                    lastFixAt == null
                        ? 'Sharing live location…'
                        : 'Location shared ${_ago(lastFixAt!)}',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: AppColors.success,
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (journey.isTracking) ...[
            const SizedBox(height: 16),
            _monitoring(context),
          ],
          const Spacer(),
          _action(context),
          const SizedBox(height: 12),
          Text(
            _hint(),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 13, color: AppColors.mutedForeground),
          ),
        ],
      ),
    );
  }

  Widget _action(BuildContext context) {
    if (journey.step == 'ARRIVED') {
      return const Column(
        children: [
          Icon(Icons.check_circle, size: 64, color: AppColors.success),
          SizedBox(height: 8),
          Text(
            'Patient delivered',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: AppColors.foreground,
            ),
          ),
        ],
      );
    }
    final (label, icon, onTap, color) = switch (journey.step) {
      'ASSIGNED' => ('Start journey', Icons.play_arrow, onStart, AppColors.success),
      'EN_ROUTE_TO_PICKUP' => ('Patient picked up', Icons.person_add_alt_1, onPicked, AppColors.primary),
      _ => ('Patient arrived', Icons.flag, onArrived, const Color(0xFF0D9488)),
    };
    return SizedBox(
      height: 120,
      child: FilledButton(
        onPressed: busy ? null : onTap,
        style: FilledButton.styleFrom(
          backgroundColor: color,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(kRadiusXl),
          ),
        ),
        child: busy
            ? const CircularProgressIndicator(color: Colors.white)
            : Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 44),
                  const SizedBox(height: 4),
                  Text(label, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                ],
              ),
      ),
    );
  }

  Widget _monitoring(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                recording ? Icons.fiber_manual_record : Icons.monitor_heart_outlined,
                size: 20,
                color: recording ? AppColors.destructive : AppColors.primary,
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Patient monitoring',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: AppColors.foreground,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            recording
                ? 'Recording… speak the vitals and any problems, then tap Stop & send.'
                : 'Speak the patient\'s vitals (every ~30 min) and any problems during transport. It is transcribed and shared with both hospitals.',
            style: const TextStyle(fontSize: 13, color: AppColors.mutedForeground),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: monitoringBusy ? null : onToggleRecording,
              style: FilledButton.styleFrom(
                backgroundColor: recording ? AppColors.destructive : AppColors.primary,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(kRadiusXl)),
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              icon: monitoringBusy
                  ? const SizedBox(
                      width: 18, height: 18,
                      child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                    )
                  : Icon(recording ? Icons.stop : Icons.mic),
              label: Text(
                monitoringBusy
                    ? 'Sending…'
                    : recording
                        ? 'Stop & send'
                        : 'Record monitoring',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _hint() {
    switch (journey.step) {
      case 'ASSIGNED':
        return 'Tap when you set off to collect the patient.';
      case 'EN_ROUTE_TO_PICKUP':
        return 'Tap once the patient is loaded and on board.';
      case 'PATIENT_ONBOARD':
        return 'Tap when you reach the receiving hospital.';
      default:
        return 'This journey is complete. You can sign out.';
    }
  }

  static String _ago(DateTime t) {
    final secs = DateTime.now().difference(t).inSeconds;
    if (secs < 60) return '${secs}s ago';
    return '${secs ~/ 60}m ago';
  }
}

class _RouteCard extends StatelessWidget {
  const _RouteCard({required this.from, required this.to});
  final String from;
  final String to;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        children: [
          _point(context, Icons.radio_button_checked, 'From', from, AppColors.success),
          const Padding(
            padding: EdgeInsets.only(left: 11),
            child: SizedBox(
              height: 22,
              child: VerticalDivider(thickness: 2, color: AppColors.border),
            ),
          ),
          _point(context, Icons.location_on, 'To', to, AppColors.destructive),
        ],
      ),
    );
  }

  Widget _point(BuildContext context, IconData icon, String label, String name, Color color) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 24, color: color),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label.toUpperCase(),
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.5,
                  color: AppColors.mutedForeground,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                name,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: AppColors.foreground,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Steps extends StatelessWidget {
  const _Steps({required this.step});
  final String step;

  static const _order = ['ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'PATIENT_ONBOARD', 'ARRIVED'];
  static const _labels = ['Assigned', 'To pickup', 'On board', 'Arrived'];

  @override
  Widget build(BuildContext context) {
    final current = _order.indexOf(step);
    return Row(
      children: List.generate(_labels.length, (i) {
        final done = i <= current;
        final color = done ? AppColors.primary : AppColors.border;
        return Expanded(
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(child: Container(height: 3, color: i == 0 ? Colors.transparent : color)),
                  Container(
                    width: 14, height: 14,
                    decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                  ),
                  Expanded(child: Container(height: 3, color: i == _labels.length - 1 ? Colors.transparent : (i < current ? AppColors.primary : AppColors.border))),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                _labels[i],
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: done ? FontWeight.w600 : FontWeight.w400,
                  color: done ? AppColors.foreground : AppColors.mutedForeground,
                ),
              ),
            ],
          ),
        );
      }),
    );
  }
}
