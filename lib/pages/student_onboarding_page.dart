import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/user_session_provider.dart';
import '../theme/app_colors.dart';

/// Shown when the signed-in Firebase email has no pending tutor invitation.
/// Invitation acceptance is automatic; students never enter a code here.
class StudentConnectionPage extends ConsumerWidget {
  const StudentConnectionPage({
    super.key,
    this.errorMessage,
    this.removed = false,
  });

  final String? errorMessage;
  final bool removed;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final hasError = errorMessage != null;
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    hasError
                        ? Icons.cloud_off_outlined
                        : removed
                        ? Icons.person_off_outlined
                        : Icons.school_outlined,
                    color: hasError
                        ? AppColors.danger
                        : AppColors.blueHighlighted,
                    size: 56,
                  ),
                  const SizedBox(height: 24),
                  Text(
                    hasError
                        ? 'We could not check your tutor connection'
                        : removed
                        ? 'You were removed from your tutor'
                        : 'You are not connected to a tutor yet',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    hasError
                        ? errorMessage!
                        : removed
                        ? 'You no longer have access to the student app. Contact your tutor if you think this was a mistake.'
                        : 'Ask your tutor to invite the exact email address you used to sign in. We will connect your account automatically after the invitation is sent.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: AppColors.navbarInactive,
                      fontSize: 15,
                      height: 1.45,
                    ),
                  ),
                  const SizedBox(height: 28),
                  TextButton(
                    onPressed: () => ref.read(userSessionProvider).signOut(),
                    child: const Text('Sign out'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
