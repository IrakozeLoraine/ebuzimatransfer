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
          initial: Config(token: ''),
          onSignedIn: (_) {},
        ),
      ),
    );

    expect(find.text('Scan setup code'), findsOneWidget);
    // The server address is baked in, so there's no server field — just creds.
    expect(find.text('Server address'), findsNothing);
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
      // The server URL in the QR is ignored; only the credentials are used.
      expect(payload!.loginId, 'amb-432h');
      expect(payload.password, 'Xy7k-9Qmn-aa3T');
    });

    test('rejects junk and incomplete codes', () {
      expect(SetupPayload.tryParse(null), isNull);
      expect(SetupPayload.tryParse('not json'), isNull);
      expect(SetupPayload.tryParse(jsonEncode({'id': 'a'})), isNull);
    });
  });
}
