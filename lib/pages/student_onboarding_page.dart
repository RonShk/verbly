import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

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
    final signedInEmail = ref.watch(firebaseUserProvider).value?.email;
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
                        : 'Your tutor invitation must match your signed-in email address. We will connect your account automatically after the invitation is sent.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: AppColors.navbarInactive,
                      fontSize: 15,
                      height: 1.45,
                    ),
                  ),
                  if (!hasError && signedInEmail != null) ...[
                    const SizedBox(height: 20),
                    Text(
                      'Ask your tutor to invite this exact address${signedInEmail.endsWith('@privaterelay.appleid.com') ? ' (your Apple Hide My Email address)' : ''}:',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: AppColors.navbarInactive,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 8),
                    SelectableText(
                      signedInEmail,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    TextButton.icon(
                      onPressed: () async {
                        await Clipboard.setData(
                          ClipboardData(text: signedInEmail),
                        );
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Email copied.')),
                          );
                        }
                      },
                      icon: const Icon(Icons.copy_outlined, size: 17),
                      label: const Text('Copy email'),
                    ),
                  ],
                  const SizedBox(height: 28),
                  TextButton(
                    onPressed: () => context.go('/profile'),
                    child: const Text('Account settings'),
                  ),
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
