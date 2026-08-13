import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme/app_colors.dart';

/// Friendly full-screen state for a practice session that has nothing to show
/// through no fault of the student — their tutor hasn't assigned words yet, or
/// they've cleared everything that was due today.
///
/// Deliberately not the error view: there is nothing broken and nothing to
/// retry, so it shows no error text and no Retry button.
class PracticeEmptyState extends StatelessWidget {
  const PracticeEmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
  });

  /// No words in the student's deck at all — their tutor hasn't added any.
  const PracticeEmptyState.noWordsAssigned({Key? key})
      : this(
          key: key,
          icon: Icons.auto_stories_outlined,
          title: 'No words yet',
          message: "Your tutor hasn't added any vocabulary for you yet.\nOnce they do, your practice will show up here.",
        );

  /// The deck has words, but none are due right now.
  const PracticeEmptyState.nothingDueToday({Key? key})
      : this(
          key: key,
          icon: Icons.check_circle_outline,
          title: 'All caught up',
          message: "You've finished every word due today.\nCheck back tomorrow for your next review.",
        );

  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    color: AppColors.blueHighlighted.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Icon(icon, size: 32, color: AppColors.blueHighlighted),
                ),
                const SizedBox(height: 20),
                Text(
                  title,
                  style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 10),
                Text(
                  message,
                  style: const TextStyle(color: AppColors.navbarInactive, fontSize: 14, height: 1.5),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 28),
                FilledButton(
                  onPressed: () => context.go('/home'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.button,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  child: const Text('Back to Home'),
                ),
              ],
            ),
          ),
        ),
        Positioned(
          top: 8,
          left: 8,
          child: IconButton(
            icon: const Icon(Icons.close),
            color: Colors.white.withValues(alpha: 0.9),
            onPressed: () => context.go('/home'),
          ),
        ),
      ],
    );
  }
}
