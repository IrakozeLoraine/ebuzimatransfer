import 'package:flutter/material.dart';

import '../call_controller.dart';
import '../theme.dart';

/// A floating call card shown over the journey screen for incoming, outgoing and
/// ongoing in-app voice calls. Driven by [CallController].
class CallOverlay extends StatelessWidget {
  const CallOverlay({super.key, required this.controller});

  final CallController controller;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        if (controller.phase == CallPhase.idle) return const SizedBox.shrink();
        return Positioned(
          left: 16,
          right: 16,
          bottom: 24,
          child: Material(
            color: Colors.transparent,
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.foreground,
                borderRadius: BorderRadius.circular(16),
                boxShadow: const [
                  BoxShadow(color: Colors.black26, blurRadius: 16, offset: Offset(0, 6)),
                ],
              ),
              child: Row(
                children: [
                  Icon(
                    controller.phase == CallPhase.incoming ? Icons.call_received : Icons.call,
                    color: Colors.white,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          controller.peerName.isEmpty ? 'Call' : controller.peerName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _status(controller),
                          style: const TextStyle(color: Colors.white70, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  ..._actions(context),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  String _status(CallController c) {
    switch (c.phase) {
      case CallPhase.incoming:
        return 'Incoming call…';
      case CallPhase.outgoing:
        return 'Calling…';
      case CallPhase.ongoing:
        return 'In call · ${c.timerLabel}';
      case CallPhase.idle:
        return '';
    }
  }

  List<Widget> _actions(BuildContext context) {
    final c = controller;
    if (c.phase == CallPhase.incoming) {
      return [
        _circle(Icons.call_end, Colors.red, () => c.end()),
        const SizedBox(width: 8),
        _circle(Icons.call, AppColors.success, () => c.answer()),
      ];
    }
    return [
      if (c.phase == CallPhase.ongoing)
        _circle(c.muted ? Icons.mic_off : Icons.mic, Colors.white24, c.toggleMute),
      if (c.phase == CallPhase.ongoing) const SizedBox(width: 8),
      _circle(Icons.call_end, Colors.red, () => c.end()),
    ];
  }

  Widget _circle(IconData icon, Color color, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        child: Icon(icon, color: Colors.white, size: 22),
      ),
    );
  }
}
