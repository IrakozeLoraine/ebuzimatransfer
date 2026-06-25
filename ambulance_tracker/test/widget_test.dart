import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ambulance_tracker/config.dart';
import 'package:ambulance_tracker/screens/login_screen.dart';
import 'package:ambulance_tracker/screens/scan_screen.dart';

void main() {
  testWidgets('sign-in screen offers a scan path and a manual fallback', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: LoginScreen(
          initial: Config(baseUrl: '', token: ''),
          onSignedIn: (_) {},
        ),
      ),
    );

    expect(find.text('Scan setup code'), findsOneWidget);
    expect(find.text('Server address'), findsOneWidget);
    expect(find.text('Login ID'), findsOneWidget);
    expect(find.text('Password'), findsOneWidget);
  });

  group('SetupPayload.tryParse', () {
    test('parses a valid setup QR', () {
      final raw = jsonEncode({
        'v': 1,
        'url': 'https://transfers.example.rw',
        'id': 'amb-432h',
        'pw': 'Xy7k-9Qmn-aa3T',
      });
      final payload = SetupPayload.tryParse(raw);
      expect(payload, isNotNull);
      expect(payload!.serverUrl, 'https://transfers.example.rw');
      expect(payload.loginId, 'amb-432h');
      expect(payload.password, 'Xy7k-9Qmn-aa3T');
    });

    test('rejects junk and incomplete codes', () {
      expect(SetupPayload.tryParse(null), isNull);
      expect(SetupPayload.tryParse('not json'), isNull);
      expect(SetupPayload.tryParse(jsonEncode({'url': 'https://x', 'id': 'a'})), isNull);
    });
  });
}
