import 'package:flutter/material.dart';

import '../config.dart';
import '../driver_api.dart';
import 'scan_screen.dart';

/// Driver sign-in. The easy path is to scan the setup QR the hospital console
/// shows when the ambulance is registered — that fills everything and signs in.
/// The fields below are the manual fallback for when there's no QR to scan.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.initial, required this.onSignedIn});

  final Config initial;
  final ValueChanged<Config> onSignedIn;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _api = DriverApi();
  late final TextEditingController _baseUrl =
      TextEditingController(text: widget.initial.baseUrl);
  final _loginId = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;
  bool _busy = false;

  @override
  void dispose() {
    _baseUrl.dispose();
    _loginId.dispose();
    _password.dispose();
    super.dispose();
  }

  /// Opens the camera, and on a valid setup QR fills the fields and signs in.
  Future<void> _scan() async {
    final payload = await Navigator.of(context).push<SetupPayload>(
      MaterialPageRoute(builder: (_) => const ScanScreen()),
    );
    if (payload == null) return;
    _baseUrl.text = payload.serverUrl;
    _loginId.text = payload.loginId;
    _password.text = payload.password;
    await _signIn();
  }

  Future<void> _signIn() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      final result = await _api.login(
        baseUrl: _baseUrl.text.trim(),
        loginId: _loginId.text.trim(),
        password: _password.text,
      );
      final config = Config(
        baseUrl: _baseUrl.text.trim(),
        token: result.token,
        plate: result.plate,
        intervalSeconds: widget.initial.intervalSeconds,
      );
      await config.save();
      if (mounted) widget.onSignedIn(config);
    } on ApiException catch (e) {
      _snack(e.message);
    } catch (e) {
      _snack('Could not reach the server. Check the address.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const SizedBox(height: 24),
              const Icon(Icons.local_hospital, size: 56, color: Color(0xFFdc2626)),
              const SizedBox(height: 8),
              Text(
                'Set up this ambulance',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 4),
              Text(
                'Scan the setup code from the hospital console to sign in — or enter '
                'the details by hand below.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 28),
              FilledButton.icon(
                onPressed: _busy ? null : _scan,
                icon: const Icon(Icons.qr_code_scanner),
                label: const Text('Scan setup code'),
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  const Expanded(child: Divider()),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Text(
                      'or enter manually',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                  const Expanded(child: Divider()),
                ],
              ),
              const SizedBox(height: 20),
              TextFormField(
                controller: _baseUrl,
                keyboardType: TextInputType.url,
                autocorrect: false,
                decoration: const InputDecoration(
                  labelText: 'Server address',
                  hintText: 'https://transfers.example.rw',
                  border: OutlineInputBorder(),
                ),
                validator: (v) {
                  final value = (v ?? '').trim();
                  if (value.isEmpty) return 'Required';
                  final uri = Uri.tryParse(value);
                  if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
                    return 'Enter a full URL, e.g. https://host';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _loginId,
                autocorrect: false,
                enableSuggestions: false,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(
                  labelText: 'Login ID',
                  border: OutlineInputBorder(),
                ),
                validator: (v) => (v ?? '').trim().isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _password,
                obscureText: _obscure,
                autocorrect: false,
                enableSuggestions: false,
                onFieldSubmitted: (_) => _signIn(),
                decoration: InputDecoration(
                  labelText: 'Password',
                  border: const OutlineInputBorder(),
                  suffixIcon: IconButton(
                    icon: Icon(_obscure ? Icons.visibility : Icons.visibility_off),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                ),
                validator: (v) => (v ?? '').isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 28),
              FilledButton.tonalIcon(
                onPressed: _busy ? null : _signIn,
                icon: _busy
                    ? const SizedBox(
                        width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.login),
                label: Text(_busy ? 'Signing in…' : 'Sign in'),
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
