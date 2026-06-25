import 'package:flutter/material.dart';

import '../config.dart';
import '../driver_api.dart';
import '../theme.dart';

/// A read-only list of this ambulance's completed journeys (sending → receiving
/// hospital, with the date it arrived).
class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key, required this.config});

  final Config config;

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  final _api = DriverApi();

  List<Journey>? _journeys;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await _api.journeys(baseUrl: widget.config.baseUrl, token: widget.config.token);
      if (!mounted) return;
      setState(() {
        _journeys = list;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Journey history'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: _loading ? null : _load,
          ),
        ],
      ),
      body: SafeArea(child: _body(context)),
    );
  }

  Widget _body(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _message(Icons.cloud_off, _error!, retry: true);
    final journeys = _journeys ?? const <Journey>[];
    if (journeys.isEmpty) {
      return _message(Icons.history, 'No completed journeys yet.');
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: journeys.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (_, i) => _HistoryCard(journey: journeys[i]),
      ),
    );
  }

  Widget _message(IconData icon, String text, {bool retry = false}) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: const BoxDecoration(color: AppColors.muted, shape: BoxShape.circle),
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
                onPressed: _load,
                icon: const Icon(Icons.refresh),
                label: const Text('Try again'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _HistoryCard extends StatelessWidget {
  const _HistoryCard({required this.journey});
  final Journey journey;

  @override
  Widget build(BuildContext context) {
    final from = journey.sending?.name ?? 'Sending facility';
    final to = journey.receiving?.name ?? 'Receiving facility';
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  journey.referralNumber,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: AppColors.foreground,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.success.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.check_circle, size: 14, color: AppColors.success),
                    SizedBox(width: 4),
                    Text(
                      'Delivered',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.success,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _leg(Icons.radio_button_checked, from, AppColors.success),
          const Padding(
            padding: EdgeInsets.only(left: 9),
            child: SizedBox(
              height: 16,
              child: VerticalDivider(thickness: 2, color: AppColors.border),
            ),
          ),
          _leg(Icons.location_on, to, AppColors.destructive),
          if (journey.arrivalTime != null) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.event_available, size: 16, color: AppColors.mutedForeground),
                const SizedBox(width: 6),
                Text(
                  'Arrived ${_formatDateTime(journey.arrivalTime!)}',
                  style: const TextStyle(fontSize: 13, color: AppColors.mutedForeground),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _leg(IconData icon, String name, Color color) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: color),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            name,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.foreground),
          ),
        ),
      ],
    );
  }
}

String _two(int n) => n.toString().padLeft(2, '0');

String _formatDateTime(DateTime t) =>
    '${t.year}-${_two(t.month)}-${_two(t.day)} ${_two(t.hour)}:${_two(t.minute)}';
