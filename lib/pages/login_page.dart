import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/user_session_provider.dart';
import '../services/auth/sign_in_method.dart';
import '../theme/app_colors.dart';

/// App entry screen shown whenever no Firebase user is signed in.
///
/// Renders one button per registered [SignInMethod], so a new sign-in method
/// (Apple, Microsoft, email, ...) becomes available automatically the moment
/// it is added to `userSessionProvider`.
class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  String? _busySignInMethodId;

  Future<void> _signIn(SignInMethod signInMethod) async {
    if (_busySignInMethodId != null) return;
    setState(() => _busySignInMethodId = signInMethod.id);
    try {
      final attempt = await signInMethod.signIn();
      if (!mounted) return;
      if (attempt.status == SignInStatus.failed) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(attempt.errorMessage ?? 'Sign-in failed.'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
      // On success the GoRouter redirect (watching firebaseUserProvider) sends
      // the user to /home automatically; no manual navigation needed.
    } finally {
      if (mounted) setState(() => _busySignInMethodId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final signInMethods = ref.watch(userSessionProvider).signInMethods;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _buildHeader(),
                const SizedBox(height: 48),
                ...signInMethods.map((method) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _SignInMethodButton(
                        signInMethod: method,
                        isBusy: _busySignInMethodId == method.id,
                        anyBusy: _busySignInMethodId != null,
                        onTap: () => _signIn(method),
                      ),
                    )),
                const SizedBox(height: 32),
                Text(
                  'By continuing you agree to our Terms of Service and Privacy Policy.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.navbarInactive, fontSize: 12),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Column(
      children: [
        Container(
          width: 72,
          height: 72,
          decoration: BoxDecoration(
            color: AppColors.button.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(20),
          ),
          child: const Icon(Icons.school_outlined, color: AppColors.blueHighlighted, size: 36),
        ),
        const SizedBox(height: 24),
        const Text(
          'Welcome to Vocab Forge',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        Text(
          'Sign in to start practicing.',
          textAlign: TextAlign.center,
          style: TextStyle(color: AppColors.navbarInactive, fontSize: 14),
        ),
      ],
    );
  }
}

class _SignInMethodButton extends StatelessWidget {
  const _SignInMethodButton({
    required this.signInMethod,
    required this.isBusy,
    required this.anyBusy,
    required this.onTap,
  });

  final SignInMethod signInMethod;
  final bool isBusy;
  final bool anyBusy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: FilledButton(
        onPressed: anyBusy ? null : onTap,
        style: FilledButton.styleFrom(
          backgroundColor: signInMethod.brandBackgroundColor,
          foregroundColor: signInMethod.brandForegroundColor,
          disabledBackgroundColor: signInMethod.brandBackgroundColor.withValues(alpha: 0.5),
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
        child: isBusy
            ? SizedBox(
                height: 22,
                width: 22,
                child: CircularProgressIndicator(strokeWidth: 2, color: signInMethod.brandForegroundColor),
              )
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconTheme(
                    data: IconThemeData(color: signInMethod.brandForegroundColor),
                    child: signInMethod.icon,
                  ),
                  const SizedBox(width: 10),
                  Text(signInMethod.displayName, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                ],
              ),
      ),
    );
  }
}
