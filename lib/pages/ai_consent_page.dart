import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/user_session_provider.dart';
import '../services/auth/student_profile_service.dart';
import '../theme/app_colors.dart';
import '../widgets/legal_links.dart';

class AiConsentPage extends ConsumerStatefulWidget {
  const AiConsentPage({super.key});

  @override
  ConsumerState<AiConsentPage> createState() => _AiConsentPageState();
}

class _AiConsentPageState extends ConsumerState<AiConsentPage> {
  bool _saving = false;

  Future<void> _allow() async {
    final uid = ref.read(firebaseUserProvider).value?.uid;
    if (uid == null) return;
    setState(() => _saving = true);
    try {
      await setAiDataSharingConsent(uid, true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not save your choice. Try again.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(28),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.auto_awesome_outlined,
                    color: AppColors.blueHighlighted,
                    size: 52,
                  ),
                  const SizedBox(height: 20),
                  const Text(
                    'AI-powered practice',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    'Verbly sends your practice answers and related assignment content to Google Gemini to generate questions, corrections, feedback, and explanations.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: AppColors.navbarInactive,
                      fontSize: 15,
                      height: 1.45,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Do not include passwords, financial, medical, or other sensitive personal information in your answers. You can withdraw permission later from Profile.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: AppColors.navbarInactive,
                      fontSize: 14,
                      height: 1.45,
                    ),
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _saving ? null : _allow,
                      child: _saving
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Allow AI data sharing'),
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: _saving ? null : () => context.go('/profile'),
                    child: const Text('Go to account settings'),
                  ),
                  const SizedBox(height: 8),
                  const LegalLinks(),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
