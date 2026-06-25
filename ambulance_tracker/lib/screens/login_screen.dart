import 'package:flutter/material.dart';

import '../config.dart';
import '../driver_api.dart';
import '../theme.dart';
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
  final _loginId = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;
  bool _busy = false;

  @override
  void dispose() {
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
    _loginId.text = payload.loginId;
    _password.text = payload.password;
    await _signIn();
  }

  Future<void> _signIn() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      final result = await _api.login(
        baseUrl: kBackendBaseUrl,
        loginId: _loginId.text.trim(),
        password: _password.text,
      );
      final config = Config(
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
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(24, 24, 24, 24),
                children: [
                  const SizedBox(height: 8),
                  const BrandHeader(),
                  const SizedBox(height: 36),
                  const Text(
                    'Set up this ambulance',
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w700,
                      color: AppColors.foreground,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Scan the setup code from the hospital console to sign in — or '
                    'enter the details by hand below.',
                    style: TextStyle(fontSize: 14, color: AppColors.mutedForeground),
                  ),
                  const SizedBox(height: 28),
                  SizedBox(
                    height: 52,
                    child: FilledButton.icon(
                      onPressed: _busy ? null : _scan,
                      icon: const Icon(Icons.qr_code_scanner),
                      label: const Text('Scan setup code'),
                    ),
                  ),
                  const SizedBox(height: 24),
                  const Row(
                    children: [
                      Expanded(child: Divider()),
                      Padding(
                        padding: EdgeInsets.symmetric(horizontal: 12),
                        child: Text(
                          'or enter manually',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppColors.mutedForeground,
                          ),
                        ),
                      ),
                      Expanded(child: Divider()),
                    ],
                  ),
                  const SizedBox(height: 24),
                  _label('Login ID'),
                  const SizedBox(height: 6),
                  TextFormField(
                    controller: _loginId,
                    autocorrect: false,
                    enableSuggestions: false,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(
                      hintText: 'Ambulance plate number',
                    ),
                    validator: (v) => (v ?? '').trim().isEmpty ? 'Required' : null,
                  ),
                  const SizedBox(height: 16),
                  _label('Password'),
                  const SizedBox(height: 6),
                  TextFormField(
                    controller: _password,
                    obscureText: _obscure,
                    autocorrect: false,
                    enableSuggestions: false,
                    onFieldSubmitted: (_) => _signIn(),
                    decoration: InputDecoration(
                      hintText: '••••••••',
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscure ? Icons.visibility : Icons.visibility_off,
                          color: AppColors.mutedForeground,
                        ),
                        onPressed: () => setState(() => _obscure = !_obscure),
                      ),
                    ),
                    validator: (v) => (v ?? '').isEmpty ? 'Required' : null,
                  ),
                  const SizedBox(height: 28),
                  SizedBox(
                    height: 52,
                    child: FilledButton(
                      onPressed: _busy ? null : _signIn,
                      child: _busy
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text('Sign in'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _label(String text) => Text(
        text,
        style: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: AppColors.foreground,
        ),
      );
}
