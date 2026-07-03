import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'driver_api.dart';

enum CallPhase { idle, incoming, outgoing, ongoing }

/// Public STUN server; sufficient for most mobile networks. A self-hosted TURN can
/// be added here later for strict NATs (matches the web client's config).
const _iceServers = {
  'iceServers': [
    {'urls': 'stun:stun.l.google.com:19302'},
  ],
};

/// Drives in-app voice calls for the ambulance: it keeps a WebSocket open on the
/// ambulance's call channel, shows incoming calls, places outgoing calls to a clinic,
/// and negotiates the WebRTC audio peer-to-peer (signalling relayed over the socket).
class CallController extends ChangeNotifier {
  CallController({required this.baseUrl, required this.token, DriverApi? api})
      : _api = api ?? DriverApi(),
        ambulanceId = _subjectOf(token);

  final String baseUrl;
  final String token;
  final String ambulanceId;
  final DriverApi _api;

  CallPhase phase = CallPhase.idle;
  String peerName = '';
  bool muted = false;
  int seconds = 0;
  String? get callId => _callId;

  WebSocketChannel? _ws;
  StreamSubscription? _wsSub;
  Timer? _reconnect;
  Timer? _ticker;
  bool _disposed = false;

  RTCPeerConnection? _pc;
  MediaStream? _localStream;
  String? _callId;
  bool _remoteReady = false; // true once the remote SDP is applied (ICE can be added)
  Map<String, dynamic>? _pendingOffer;
  final List<Map<String, dynamic>> _pendingIce = [];

  /// The "ws(s)://host/ws/<channel>" URL for this ambulance's call channel.
  String get _wsUrl {
    var b = baseUrl.trim();
    while (b.endsWith('/')) {
      b = b.substring(0, b.length - 1);
    }
    b = b.replaceFirst(RegExp(r'^http'), 'ws'); // http->ws, https->wss
    return '$b/ws/ambulance-call:$ambulanceId';
  }

  /// Decode the JWT subject (the ambulance id) without verifying the signature.
  static String _subjectOf(String jwt) {
    try {
      final parts = jwt.split('.');
      if (parts.length < 2) return '';
      var p = parts[1].replaceAll('-', '+').replaceAll('_', '/');
      while (p.length % 4 != 0) {
        p += '=';
      }
      final map = jsonDecode(utf8.decode(base64.decode(p))) as Map<String, dynamic>;
      return map['sub'] as String? ?? '';
    } catch (_) {
      return '';
    }
  }

  void connect() {
    if (ambulanceId.isEmpty || _disposed) return;
    _openSocket();
  }

  void _openSocket() {
    try {
      _ws = WebSocketChannel.connect(Uri.parse(_wsUrl));
      _wsSub = _ws!.stream.listen(
        _onMessage,
        onDone: _scheduleReconnect,
        onError: (_) => _scheduleReconnect(),
        cancelOnError: true,
      );
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    if (_disposed) return;
    _reconnect?.cancel();
    _reconnect = Timer(const Duration(seconds: 3), _openSocket);
  }

  Future<void> _onMessage(dynamic raw) async {
    Map<String, dynamic> msg;
    try {
      msg = jsonDecode(raw as String) as Map<String, dynamic>;
    } catch (_) {
      return;
    }
    final event = msg['event'] as String?;
    if (event == null || !event.startsWith('CALL_')) return;

    switch (event) {
      case 'CALL_INCOMING':
        if (phase != CallPhase.idle) return; // already busy
        _callId = msg['call_id'] as String?;
        peerName = (msg['caller_name'] as String?) ?? 'Clinic';
        phase = CallPhase.incoming;
        notifyListeners();
        break;
      case 'CALL_ANSWERED':
        if (msg['call_id'] != _callId) return;
        peerName = (msg['answered_by'] as String?) ?? peerName;
        await _beginCallerOffer();
        break;
      case 'CALL_TAKEN':
      case 'CALL_ENDED':
        if (msg['call_id'] != _callId) return;
        await _cleanup();
        break;
      case 'CALL_SIGNAL':
        if (msg['call_id'] != _callId) return;
        await _onSignal(msg['kind'] as String?, msg['data']);
        break;
    }
  }

  // ── Outgoing: ambulance calls a clinic ─────────────────────────────────────────────
  Future<void> placeCall(String referralId, {String side = 'receiving', String? label}) async {
    if (phase != CallPhase.idle) return;
    peerName = label ?? (side == 'referring' ? 'Referring clinic' : 'Receiving clinic');
    phase = CallPhase.outgoing;
    notifyListeners();
    try {
      _callId = await _api.startCall(baseUrl: baseUrl, token: token, referralId: referralId, side: side);
    } catch (e) {
      await _cleanup();
      rethrow;
    }
  }

  /// Caller side: once a clinician answers, set up media and send the SDP offer.
  Future<void> _beginCallerOffer() async {
    final id = _callId;
    if (id == null || _pc != null) return;
    final pc = await _createPeer();
    final offer = await pc.createOffer({});
    await pc.setLocalDescription(offer);
    await _api.sendSignal(baseUrl: baseUrl, token: token, callId: id, kind: 'offer', data: offer.toMap());
    _startOngoing();
  }

  // ── Incoming: ambulance answers a clinician's call ──────────────────────────────────
  Future<void> answer() async {
    final id = _callId;
    if (id == null) return;
    await _api.answerCall(baseUrl: baseUrl, token: token, callId: id);
    await _createPeer();
    _startOngoing();
    await _consumeOffer(); // apply the caller's offer if it already arrived
  }

  Future<void> _consumeOffer() async {
    final pc = _pc;
    final offer = _pendingOffer;
    final id = _callId;
    if (pc == null || offer == null || id == null) return;
    _pendingOffer = null;
    await pc.setRemoteDescription(RTCSessionDescription(offer['sdp'] as String?, offer['type'] as String?));
    _remoteReady = true;
    final answer = await pc.createAnswer({});
    await pc.setLocalDescription(answer);
    await _api.sendSignal(baseUrl: baseUrl, token: token, callId: id, kind: 'answer', data: answer.toMap());
    await _flushIce();
  }

  Future<void> _onSignal(String? kind, dynamic data) async {
    if (data is! Map) return;
    final d = Map<String, dynamic>.from(data);
    final pc = _pc;
    if (kind == 'offer') {
      _pendingOffer = d;
      if (pc != null) await _consumeOffer();
    } else if (kind == 'answer') {
      if (pc != null) {
        await pc.setRemoteDescription(RTCSessionDescription(d['sdp'] as String?, d['type'] as String?));
        _remoteReady = true;
        await _flushIce();
      }
    } else if (kind == 'ice') {
      if (pc != null && _remoteReady) {
        await _addIce(pc, d);
      } else {
        _pendingIce.add(d);
      }
    }
  }

  Future<void> _addIce(RTCPeerConnection pc, Map<String, dynamic> d) async {
    try {
      await pc.addCandidate(RTCIceCandidate(
        d['candidate'] as String?,
        d['sdpMid'] as String?,
        d['sdpMLineIndex'] as int?,
      ));
    } catch (_) {/* ignore late/duplicate candidates */}
  }

  Future<void> _flushIce() async {
    final pc = _pc;
    if (pc == null) return;
    for (final c in _pendingIce) {
      await _addIce(pc, c);
    }
    _pendingIce.clear();
  }

  Future<RTCPeerConnection> _createPeer() async {
    final pc = await createPeerConnection(_iceServers);
    _localStream = await navigator.mediaDevices.getUserMedia({'audio': true, 'video': false});
    for (final track in _localStream!.getTracks()) {
      await pc.addTrack(track, _localStream!);
    }
    pc.onIceCandidate = (cand) {
      final id = _callId;
      if (id != null && cand.candidate != null) {
        _api.sendSignal(baseUrl: baseUrl, token: token, callId: id, kind: 'ice', data: cand.toMap());
      }
    };
    pc.onConnectionState = (state) {
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateFailed ||
          state == RTCPeerConnectionState.RTCPeerConnectionStateDisconnected) {
        end();
      }
    };
    // Route remote audio to the loudspeaker so the driver can talk hands-free.
    Helper.setSpeakerphoneOn(true);
    _pc = pc;
    return pc;
  }

  void _startOngoing() {
    phase = CallPhase.ongoing;
    seconds = 0;
    _ticker?.cancel();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      seconds++;
      notifyListeners();
    });
    notifyListeners();
  }

  void toggleMute() {
    final stream = _localStream;
    if (stream == null) return;
    muted = !muted;
    for (final t in stream.getAudioTracks()) {
      t.enabled = !muted;
    }
    notifyListeners();
  }

  /// Hang up / decline — tell the server and tear down locally.
  Future<void> end() async {
    final id = _callId;
    if (id != null) {
      try {
        await _api.endCall(baseUrl: baseUrl, token: token, callId: id);
      } catch (_) {}
    }
    await _cleanup();
  }

  Future<void> _cleanup() async {
    _ticker?.cancel();
    _ticker = null;
    try {
      await _localStream?.dispose();
    } catch (_) {}
    _localStream = null;
    try {
      await _pc?.close();
    } catch (_) {}
    _pc = null;
    _pendingOffer = null;
    _pendingIce.clear();
    _callId = null;
    _remoteReady = false;
    phase = CallPhase.idle;
    muted = false;
    seconds = 0;
    peerName = '';
    if (!_disposed) notifyListeners();
  }

  String get timerLabel {
    final m = (seconds ~/ 60).toString();
    final s = (seconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  @override
  void dispose() {
    _disposed = true;
    _reconnect?.cancel();
    _ticker?.cancel();
    _wsSub?.cancel();
    _ws?.sink.close();
    _localStream?.dispose();
    _pc?.close();
    super.dispose();
  }
}
